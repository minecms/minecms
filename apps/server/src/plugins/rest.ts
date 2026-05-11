import type { SchemaDefinition } from '@minecms/core';
import { and, count, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { MineDb } from '../db';
import { expandImageFields } from '../schemas/expand-images';
import type { ServerState } from '../state';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface RestOptions {
  state: ServerState;
}

interface ListQuery {
  limit?: string;
  offset?: string;
}

/**
 * Публичные REST-эндпоинты для `@minecms/sdk`. Только чтение —
 * `GET /api/v1/:schema` (список) и `GET /api/v1/:schema/:slug` (один документ).
 *
 * До прохождения install-визарда возвращаем 503: SDK даже не должен пытаться читать
 * данные с свеже-склонированной машины. После install — тянем напрямую из активного
 * соединения, минуя tRPC: SDK-клиент это просто HTTP-fetch без накладных расходов.
 *
 * **Фильтр публикации:** если в схеме объявлено булево поле `published`, REST
 * отдаёт только документы с `published = true`. Документы-черновики видны
 * только из Studio (`documents.*` за `authenticatedProcedure`). Это базовая
 * защита от утечки draft-контента наружу.
 */
async function registerRest(app: FastifyInstance, opts: RestOptions): Promise<void> {
  const { state } = opts;

  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/v1/')) return;
    if (state.installationState !== 'installed' || !state.db) {
      reply.code(503).send({
        error: 'INSTALL_REQUIRED',
        message: 'MineCMS ещё не установлена — REST API недоступен.',
      });
    }
  });

  app.get('/api/v1/:schema', async (req: FastifyRequest, reply: FastifyReply) => {
    const params = req.params as { schema: string };
    const query = req.query as ListQuery;

    const schema = state.userSchemas.find((s) => s.name === params.schema);
    if (!schema) {
      return reply.code(404).send({ error: 'SCHEMA_NOT_FOUND' });
    }
    const db = state.db;
    if (!db) {
      return reply.code(503).send({ error: 'DB_NOT_READY' });
    }

    const limit = clampNumber(query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
    const offset = clampNumber(query.offset, 0, 0, Number.MAX_SAFE_INTEGER);

    const tables = db.kind === 'mysql' ? state.userTables.mysql : state.userTables.postgres;
    const table = tables.bySchemaName[schema.name];
    if (!table) {
      return reply.code(500).send({ error: 'TABLE_NOT_BUILT' });
    }

    try {
      const filter = combineFilters(
        buildPublishedFilter(schema, table),
        buildNotTrashedFilter(table),
      );
      const rows = await selectAll(db, table, filter, limit, offset);
      const total = await selectCount(db, table, filter);
      await expandImageFields(state, schema, rows);
      return { items: rows, total, limit, offset };
    } catch (error) {
      req.log.error({ err: error, schema: params.schema }, 'REST list query failed');
      return reply.code(500).send({
        error: 'QUERY_FAILED',
        message: 'Failed to execute list query against the database.',
      });
    }
  });

  app.get('/api/v1/:schema/:slug', async (req: FastifyRequest, reply: FastifyReply) => {
    const params = req.params as { schema: string; slug: string };

    const schema = state.userSchemas.find((s) => s.name === params.schema);
    if (!schema) {
      return reply.code(404).send({ error: 'SCHEMA_NOT_FOUND' });
    }
    const routeField = schema.routeField as string | undefined;
    if (!routeField) {
      return reply.code(400).send({ error: 'ROUTE_FIELD_NOT_DEFINED' });
    }
    const db = state.db;
    if (!db) {
      return reply.code(503).send({ error: 'DB_NOT_READY' });
    }
    const tables = db.kind === 'mysql' ? state.userTables.mysql : state.userTables.postgres;
    const table = tables.bySchemaName[schema.name];
    if (!table) {
      return reply.code(500).send({ error: 'TABLE_NOT_BUILT' });
    }

    const fieldColumn = (table as unknown as Record<string, unknown>)[routeField];
    try {
      const filter = combineFilters(
        buildPublishedFilter(schema, table),
        buildNotTrashedFilter(table),
      );
      const rows = await selectByEq(db, table, fieldColumn, params.slug, filter);
      const item = rows[0];
      if (!item) {
        return reply.code(404).send({ error: 'NOT_FOUND' });
      }
      await expandImageFields(state, schema, [item]);
      return { item };
    } catch (error) {
      req.log.error(
        { err: error, schema: params.schema, slug: params.slug },
        'REST get query failed',
      );
      return reply.code(500).send({
        error: 'QUERY_FAILED',
        message: 'Failed to execute get query against the database.',
      });
    }
  });
}

export const restPlugin = fp(registerRest);

function clampNumber(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/**
 * Строит SQL-фильтр `published = true`, если у схемы есть булево поле
 * `published`. Иначе возвращает `null` — REST отдаёт всё (singleton-схемы
 * без публикации, например `home`, не имеют этого поля).
 *
 * Признаком является **наличие** поля `published` с типом `boolean` в схеме
 * пользователя. До появления системного поля «опубликовано» в core это
 * единственный безопасный способ не сломать обратную совместимость и при
 * этом не отдавать черновики наружу.
 *
 * Экспортируется в основном для unit-тестов: REST-плагин использует её
 * локально, без внешних потребителей.
 */
export function buildPublishedFilter(
  schema: SchemaDefinition,
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle разводит mysql/pg по типам — общий any.
  table: any,
): import('drizzle-orm').SQL | null {
  const publishedField = (schema.fields as Record<string, { type?: unknown } | undefined>)
    .published;
  if (!publishedField || publishedField.type !== 'boolean') return null;
  const column = (table as Record<string, unknown>).published;
  if (column === undefined) return null;
  return eq(column as never, true as never);
}

/**
 * Фильтр «документ не в корзине» (`deleted_at IS NULL`). Применяется ко всем
 * публичным REST-запросам — soft-deleted документы наружу не должны утекать.
 */
export function buildNotTrashedFilter(
  // biome-ignore lint/suspicious/noExplicitAny: см. buildPublishedFilter.
  table: any,
): import('drizzle-orm').SQL | null {
  const column = (table as Record<string, unknown>).deleted_at;
  if (column === undefined) return null;
  return isNull(column as never);
}

function combineFilters(
  ...filters: Array<import('drizzle-orm').SQL | null>
): import('drizzle-orm').SQL | null {
  const present = filters.filter((f): f is import('drizzle-orm').SQL => f !== null);
  if (present.length === 0) return null;
  if (present.length === 1) return present[0] ?? null;
  const first = present[0];
  if (!first) return null;
  return present
    .slice(1)
    .reduce<import('drizzle-orm').SQL>((acc, cur) => and(acc, cur) as never, first);
}

async function selectAll(
  db: MineDb,
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle-таблицы mysql/pg структурно различны — общий any.
  table: any,
  publishedFilter: import('drizzle-orm').SQL | null,
  limit: number,
  offset: number,
): Promise<Record<string, unknown>[]> {
  const where = publishedFilter ?? sql`1 = 1`;
  if (db.kind === 'mysql') {
    return db.db.select().from(table).where(where).limit(limit).offset(offset);
  }
  return db.db.select().from(table).where(where).limit(limit).offset(offset);
}

async function selectCount(
  db: MineDb,
  // biome-ignore lint/suspicious/noExplicitAny: см. selectAll.
  table: any,
  publishedFilter: import('drizzle-orm').SQL | null,
): Promise<number> {
  if (publishedFilter === null) {
    if (db.kind === 'mysql') {
      const rows = await db.db.select({ value: count() }).from(table);
      return Number(rows[0]?.value ?? 0);
    }
    const rows = await db.db.select({ value: count() }).from(table);
    return Number(rows[0]?.value ?? 0);
  }
  if (db.kind === 'mysql') {
    const rows = await db.db.select({ value: count() }).from(table).where(publishedFilter);
    return Number(rows[0]?.value ?? 0);
  }
  const rows = await db.db.select({ value: count() }).from(table).where(publishedFilter);
  return Number(rows[0]?.value ?? 0);
}

async function selectByEq(
  db: MineDb,
  // biome-ignore lint/suspicious/noExplicitAny: см. selectAll.
  table: any,
  column: unknown,
  value: string,
  publishedFilter: import('drizzle-orm').SQL | null,
): Promise<Record<string, unknown>[]> {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle eq принимает разные column-типы между mysql/pg.
  const col = column as any;
  const eqClause = eq(col, value);
  const where = publishedFilter ? and(eqClause, publishedFilter) : eqClause;
  if (db.kind === 'mysql') {
    return db.db.select().from(table).where(where).limit(1);
  }
  return db.db.select().from(table).where(where).limit(1);
}
