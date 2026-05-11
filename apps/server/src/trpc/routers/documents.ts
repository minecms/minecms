import type { SchemaDefinition } from '@minecms/core';
import { schemaToZod } from '@minecms/core';
import { and, count, eq, isNull, type SQL, sql } from 'drizzle-orm';
import type { MySqlTable } from 'drizzle-orm/mysql-core';
import type { PgTable } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { MineDb } from '../../db';
import { collectImageUsages, findBrokenImage } from '../../schemas/images';
import { collectReferenceUsages, findBrokenReference } from '../../schemas/references';
import type { ServerState } from '../../state';
import { router, TRPCError } from '../core';
import { authenticatedProcedure } from '../middlewares';

/**
 * SQL-фильтр «документ активен» (не в корзине). Все обычные запросы
 * (`list`/`get`/`count`/REST) комбинируют его с прочими where-клаузами.
 */
export function notTrashed(table: MySqlTable | PgTable): SQL {
  const col = (table as unknown as Record<string, unknown>).deleted_at;
  if (!col) return sql`1 = 1`;
  return isNull(col as never);
}

const schemaNameInput = z.object({
  schema: z.string().min(1),
});

const listInput = schemaNameInput.extend({
  limit: z.number().int().positive().max(200).default(50),
  offset: z.number().int().nonnegative().default(0),
});

const idInput = schemaNameInput.extend({
  id: z.union([z.number().int().nonnegative(), z.string().min(1)]),
});

const getInput = schemaNameInput.extend({
  id: z.union([z.number().int().nonnegative(), z.string().min(1)]).optional(),
  slug: z.string().min(1).optional(),
});

/**
 * Достаёт описание схемы и её Drizzle-таблицу из state по имени схемы.
 * Бросает `NOT_FOUND`, если такой схемы нет — Studio покажет нормальную ошибку.
 */
function lookupSchemaAndTable(
  state: ServerState,
  db: MineDb,
  schemaName: string,
): { schema: SchemaDefinition; table: MySqlTable | PgTable } {
  const schema = state.userSchemas.find((s) => s.name === schemaName);
  if (!schema) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Схема "${schemaName}" не объявлена в minecms.config.ts.`,
    });
  }
  const tables = db.kind === 'mysql' ? state.userTables.mysql : state.userTables.postgres;
  const table = tables.bySchemaName[schemaName];
  if (!table) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Таблица для схемы "${schemaName}" не построена. Перезапусти сервер.`,
    });
  }
  return { schema, table };
}

/**
 * Выполняет SELECT * с произвольным WHERE. Drizzle разводит mysql/pg типы отдельно,
 * но синтаксически вызов одинаковый — сужаем по `db.kind`, чтобы вернуть строки нужного типа.
 */
async function selectWhere(
  db: MineDb,
  table: MySqlTable | PgTable,
  whereSQL: SQL,
  limit: number,
  offset: number,
): Promise<Record<string, unknown>[]> {
  if (db.kind === 'mysql') {
    return db.db
      .select()
      .from(table as MySqlTable)
      .where(whereSQL)
      .limit(limit)
      .offset(offset);
  }
  return db.db
    .select()
    .from(table as PgTable)
    .where(whereSQL)
    .limit(limit)
    .offset(offset);
}

/**
 * `SELECT count(*)` поверх таблицы с произвольным WHERE. Drizzle разводит
 * mysql/pg вызовы — оборачиваем, чтобы наружу торчало одно число.
 */
async function countAll(db: MineDb, table: MySqlTable | PgTable, whereSQL: SQL): Promise<number> {
  if (db.kind === 'mysql') {
    const rows = await db.db
      .select({ value: count() })
      .from(table as MySqlTable)
      .where(whereSQL);
    return Number(rows[0]?.value ?? 0);
  }
  const rows = await db.db
    .select({ value: count() })
    .from(table as PgTable)
    .where(whereSQL);
  return Number(rows[0]?.value ?? 0);
}

/**
 * Универсальный CRUD по динамическим схемам.
 * Все процедуры идут через `authenticatedProcedure` — требуется завершённая
 * установка, активное соединение **и валидная сессия пользователя Studio**.
 *
 * Анонимные пользователи публичного сайта читают данные через REST
 * (`GET /api/v1/:schema`) с фильтром `published = true` — см. `plugins/rest.ts`.
 *
 * Имя схемы передаётся в `input.schema`; валидируется по списку из `state.userSchemas`.
 * Тело документа валидируется Zod-валидатором из `schemaToZod` (тот же, что использует @minecms/core).
 */
export const documentsRouter = router({
  /**
   * Список документов с пагинацией. Возвращает страницу и общий счётчик —
   * Studio использует `total` для отрисовки «1–50 из 234» и кнопок «дальше/назад».
   */
  list: authenticatedProcedure.input(listInput).query(async ({ ctx, input }) => {
    const { table } = lookupSchemaAndTable(ctx.state, ctx.db, input.schema);
    const where = notTrashed(table);
    const rows = await selectWhere(ctx.db, table, where, input.limit, input.offset);
    const total = await countAll(ctx.db, table, where);
    return { items: rows, total, limit: input.limit, offset: input.offset };
  }),

  /**
   * Только счётчик — нужен для дашборда (виджеты без загрузки самих документов).
   */
  count: authenticatedProcedure.input(schemaNameInput).query(async ({ ctx, input }) => {
    const { table } = lookupSchemaAndTable(ctx.state, ctx.db, input.schema);
    return { total: await countAll(ctx.db, table, notTrashed(table)) };
  }),

  /**
   * Возвращает один документ по `id` или по `slug` (если в схеме объявлен `routeField`).
   * Документы в корзине игнорируются (см. `notTrashed`).
   */
  get: authenticatedProcedure.input(getInput).query(async ({ ctx, input }) => {
    if (input.id === undefined && input.slug === undefined) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Передай id или slug.' });
    }
    const { schema, table } = lookupSchemaAndTable(ctx.state, ctx.db, input.schema);

    let where: SQL;
    if (input.id !== undefined) {
      const idColumn = (table as unknown as Record<string, unknown>).id as never;
      where = and(eq(idColumn, input.id as never), notTrashed(table)) as SQL;
    } else {
      const routeField = schema.routeField as string | undefined;
      if (!routeField) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `У схемы "${schema.name}" нет routeField — поиск по slug недоступен.`,
        });
      }
      const fieldColumn = (table as unknown as Record<string, unknown>)[routeField] as never;
      where = and(eq(fieldColumn, input.slug as never), notTrashed(table)) as SQL;
    }

    const rows = await selectWhere(ctx.db, table, where, 1, 0);
    const item = rows[0];
    if (!item) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Документ не найден.' });
    }
    return { item };
  }),

  /**
   * Создаёт документ. Тело валидируется Zod-валидатором из схемы.
   */
  create: authenticatedProcedure
    .input(schemaNameInput.extend({ data: z.unknown() }))
    .mutation(async ({ ctx, input }) => {
      const { schema, table } = lookupSchemaAndTable(ctx.state, ctx.db, input.schema);
      if (schema.singleton) {
        const total = await countAll(ctx.db, table, notTrashed(table));
        if (total >= 1) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Схема "${schema.name}" объявлена как singleton — второй документ создать нельзя.`,
          });
        }
      }
      const validator = schemaToZod(schema);
      const data = validator.parse(input.data);

      const broken = await findBrokenReference(
        ctx.db,
        ctx.state,
        collectReferenceUsages(schema, data as Record<string, unknown>),
      );
      if (broken) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Ссылка ${broken.path} = ${broken.id} указывает на отсутствующий документ (${broken.to.join('|')}).`,
        });
      }

      const brokenImage = await findBrokenImage(
        ctx.db,
        collectImageUsages(schema, data as Record<string, unknown>),
      );
      if (brokenImage) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Поле ${brokenImage.path} ссылается на несуществующий медиа-файл (assetId=${brokenImage.assetId}).`,
        });
      }

      if (ctx.db.kind === 'mysql') {
        const result = await ctx.db.db.insert(table as MySqlTable).values(data as never);
        const insertId = (result as unknown as Array<{ insertId?: number }>)[0]?.insertId ?? null;
        return { ok: true, id: insertId } as const;
      }
      const inserted = await ctx.db.db
        .insert(table as PgTable)
        .values(data as never)
        .returning();
      return { ok: true, item: inserted[0] ?? null } as const;
    }),

  /**
   * Частичное обновление документа по id.
   */
  update: authenticatedProcedure
    .input(idInput.extend({ data: z.record(z.string(), z.unknown()) }))
    .mutation(async ({ ctx, input }) => {
      const { schema, table } = lookupSchemaAndTable(ctx.state, ctx.db, input.schema);
      const validator = schemaToZod(schema).partial();
      const data = validator.parse(input.data);

      const broken = await findBrokenReference(
        ctx.db,
        ctx.state,
        collectReferenceUsages(schema, data as Record<string, unknown>),
      );
      if (broken) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Ссылка ${broken.path} = ${broken.id} указывает на отсутствующий документ (${broken.to.join('|')}).`,
        });
      }

      const brokenImage = await findBrokenImage(
        ctx.db,
        collectImageUsages(schema, data as Record<string, unknown>),
      );
      if (brokenImage) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Поле ${brokenImage.path} ссылается на несуществующий медиа-файл (assetId=${brokenImage.assetId}).`,
        });
      }

      const idColumn = (table as unknown as Record<string, unknown>).id as never;
      const whereUpdate = and(eq(idColumn, input.id as never), notTrashed(table)) as SQL;
      if (ctx.db.kind === 'mysql') {
        await ctx.db.db
          .update(table as MySqlTable)
          .set(data as never)
          .where(whereUpdate);
      } else {
        await ctx.db.db
          .update(table as PgTable)
          .set(data as never)
          .where(whereUpdate);
      }
      return { ok: true } as const;
    }),

  /**
   * Soft delete: проставляет `deleted_at = NOW()`. Документ исчезает из обычных
   * выдач (Studio-список, REST, get), но физически остаётся в БД и доступен
   * через `trash.*`. Hard delete — отдельной операцией `trash.purge`.
   */
  delete: authenticatedProcedure.input(idInput).mutation(async ({ ctx, input }) => {
    const { table } = lookupSchemaAndTable(ctx.state, ctx.db, input.schema);
    const idColumn = (table as unknown as Record<string, unknown>).id as never;
    const whereDelete = and(eq(idColumn, input.id as never), notTrashed(table)) as SQL;
    const now = new Date();
    if (ctx.db.kind === 'mysql') {
      await ctx.db.db
        .update(table as MySqlTable)
        .set({ deleted_at: now } as never)
        .where(whereDelete);
    } else {
      await ctx.db.db
        .update(table as PgTable)
        .set({ deleted_at: now } as never)
        .where(whereDelete);
    }
    return { ok: true } as const;
  }),
});
