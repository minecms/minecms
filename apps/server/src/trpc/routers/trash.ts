import { count, desc, eq, isNotNull } from 'drizzle-orm';
import type { MySqlTable } from 'drizzle-orm/mysql-core';
import type { PgTable } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { MineDb } from '../../db';
import { rowToAsset } from '../../media/upload-handler';
import type { ServerState } from '../../state';
import { router, TRPCError } from '../core';
import { authenticatedProcedure } from '../middlewares';

const sectionDocsInput = z.object({
  section: z.literal('documents'),
  schema: z.string().min(1),
});

const sectionMediaInput = z.object({
  section: z.literal('media'),
});

const docsIdInput = sectionDocsInput.extend({
  id: z.number().int().positive(),
});

const mediaIdInput = sectionMediaInput.extend({
  id: z.number().int().positive(),
});

const listDocsInput = sectionDocsInput.extend({
  limit: z.number().int().positive().max(200).default(50),
  offset: z.number().int().nonnegative().default(0),
});
const listMediaInput = sectionMediaInput.extend({
  limit: z.number().int().positive().max(200).default(50),
  offset: z.number().int().nonnegative().default(0),
});

/**
 * Нормализованная запись в едином списке корзины — общий слой
 * над документами разных схем и медиа.
 */
export type TrashItem =
  | {
      kind: 'document';
      schema: string;
      schemaLabel: string;
      id: number;
      title: string;
      deletedAt: string | null;
    }
  | {
      kind: 'media';
      id: number;
      title: string;
      mimeType: string;
      viewUrl: string | null;
      deletedAt: string | null;
    };

/** Эвристика "вытащить читаемый заголовок из произвольного документа". */
function pickTitle(row: Record<string, unknown>, fields: Record<string, unknown>): string {
  for (const key of ['title', 'name', 'label']) {
    const v = row[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  for (const [key, def] of Object.entries(fields)) {
    if (def && typeof def === 'object' && (def as { type?: unknown }).type === 'string') {
      const v = row[key];
      if (typeof v === 'string' && v.length > 0) return v;
    }
  }
  return `#${row.id}`;
}

function readDateIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Возвращает Drizzle-таблицу для пользовательской схемы или бросает NOT_FOUND.
 */
function lookupUserTable(state: ServerState, db: MineDb, schemaName: string): MySqlTable | PgTable {
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
  return table;
}

/**
 * Корзина — единая точка доступа к soft-deleted сущностям.
 *
 * Контракт:
 * - `list({ section: 'documents', schema })` — удалённые документы конкретной схемы.
 * - `list({ section: 'media' })` — удалённые медиа-ассеты.
 * - `summary` — счётчики по всем разделам (для значков в навигации).
 * - `restore` — снимает `deleted_at`. Документ/ассет возвращается в обычные выдачи.
 * - `purge` — hard delete: документ/строка ассета удаляется из БД физически.
 *   Для media — также из S3.
 *
 * Все процедуры — `authenticatedProcedure`, доступны только Studio-сессии.
 */
export const trashRouter = router({
  /** Сводка: сколько элементов в корзине по каждому разделу. */
  summary: authenticatedProcedure.query(async ({ ctx }) => {
    const byDocSchema: Array<{ schema: string; label: string; total: number }> = [];
    for (const schema of ctx.state.userSchemas) {
      const table = lookupUserTable(ctx.state, ctx.db, schema.name);
      const total = await countTrashedDocs(ctx.db, table);
      byDocSchema.push({ schema: schema.name, label: schema.label ?? schema.name, total });
    }
    const mediaTotal = await countTrashedMedia(ctx.db);
    const grandTotal = byDocSchema.reduce((acc, x) => acc + x.total, 0) + mediaTotal;
    return { byDocSchema, mediaTotal, grandTotal };
  }),

  /**
   * Единый список всего удалённого: документы любых схем + медиа.
   * Возвращает уже нормализованные элементы, готовые для рендера —
   * фронт сортирует/фильтрует на месте.
   */
  listAll: authenticatedProcedure.query(async ({ ctx }) => {
    const items: TrashItem[] = [];

    for (const schema of ctx.state.userSchemas) {
      const table = lookupUserTable(ctx.state, ctx.db, schema.name);
      const rows = await selectTrashedDocs(ctx.db, table, 500, 0);
      for (const row of rows) {
        const raw = row as Record<string, unknown>;
        const id = Number(raw.id);
        items.push({
          kind: 'document',
          schema: schema.name,
          schemaLabel: schema.label ?? schema.name,
          id,
          title: pickTitle(raw, schema.fields),
          deletedAt: readDateIso(raw.deleted_at),
        });
      }
    }

    const mediaRows = await fetchTrashedMedia(ctx.db, 500, 0);
    for (const row of mediaRows.rows) {
      const asset = rowToAsset(row);
      const viewUrl = ctx.state.storage
        ? await ctx.state.storage.getViewUrl(asset.storageKey)
        : null;
      items.push({
        kind: 'media',
        id: asset.id,
        title: asset.originalFilename,
        mimeType: asset.mimeType,
        viewUrl,
        deletedAt: asset.deletedAt === null ? null : asset.deletedAt.toISOString(),
      });
    }

    items.sort((a, b) => {
      const da = a.deletedAt ?? '';
      const db = b.deletedAt ?? '';
      return db.localeCompare(da);
    });

    return { items };
  }),

  /** Список удалённых документов одной схемы (с пагинацией). */
  listDocuments: authenticatedProcedure.input(listDocsInput).query(async ({ ctx, input }) => {
    const table = lookupUserTable(ctx.state, ctx.db, input.schema);
    const rows = await selectTrashedDocs(ctx.db, table, input.limit, input.offset);
    const total = await countTrashedDocs(ctx.db, table);
    return { items: rows, total, limit: input.limit, offset: input.offset };
  }),

  /** Список удалённых медиа-ассетов. */
  listMedia: authenticatedProcedure.input(listMediaInput).query(async ({ ctx, input }) => {
    const { rows, total } = await fetchTrashedMedia(ctx.db, input.limit, input.offset);
    const items = await Promise.all(
      rows.map(async (row) => {
        const asset = rowToAsset(row);
        const viewUrl = ctx.state.storage
          ? await ctx.state.storage.getViewUrl(asset.storageKey)
          : null;
        return {
          id: asset.id,
          originalFilename: asset.originalFilename,
          mimeType: asset.mimeType,
          size: asset.size,
          width: asset.width,
          height: asset.height,
          alt: asset.alt,
          deletedAt: asset.deletedAt === null ? null : asset.deletedAt.toISOString(),
          viewUrl,
        };
      }),
    );
    return { items, total, limit: input.limit, offset: input.offset };
  }),

  /** Восстановление документа из корзины (deleted_at → NULL). */
  restoreDocument: authenticatedProcedure.input(docsIdInput).mutation(async ({ ctx, input }) => {
    const table = lookupUserTable(ctx.state, ctx.db, input.schema);
    const idColumn = (table as unknown as Record<string, unknown>).id as never;
    if (ctx.db.kind === 'mysql') {
      await ctx.db.db
        .update(table as MySqlTable)
        .set({ deleted_at: null } as never)
        .where(eq(idColumn, input.id as never));
    } else {
      await ctx.db.db
        .update(table as PgTable)
        .set({ deleted_at: null } as never)
        .where(eq(idColumn, input.id as never));
    }
    return { ok: true } as const;
  }),

  /** Восстановление медиа-ассета из корзины. */
  restoreMedia: authenticatedProcedure.input(mediaIdInput).mutation(async ({ ctx, input }) => {
    if (ctx.db.kind === 'mysql') {
      const t = ctx.db.schema.mediaAssets;
      await ctx.db.db.update(t).set({ deletedAt: null }).where(eq(t.id, input.id));
    } else {
      const t = ctx.db.schema.mediaAssets;
      await ctx.db.db.update(t).set({ deletedAt: null }).where(eq(t.id, input.id));
    }
    return { ok: true } as const;
  }),

  /**
   * Hard delete документа: физически удаляет строку из БД. Никакого медиа
   * не трогаем — даже если документ ссылался на ассеты, они остаются в
   * `media_assets` (медиа удаляется только через `purgeMedia`).
   */
  purgeDocument: authenticatedProcedure.input(docsIdInput).mutation(async ({ ctx, input }) => {
    const table = lookupUserTable(ctx.state, ctx.db, input.schema);
    const idColumn = (table as unknown as Record<string, unknown>).id as never;
    if (ctx.db.kind === 'mysql') {
      await ctx.db.db.delete(table as MySqlTable).where(eq(idColumn, input.id as never));
    } else {
      await ctx.db.db.delete(table as PgTable).where(eq(idColumn, input.id as never));
    }
    return { ok: true } as const;
  }),

  /**
   * Hard delete медиа: удаляет файл из S3 и строку из media_assets. Если
   * S3 упал — пробрасываем ошибку и БД не трогаем (можно повторить).
   */
  purgeMedia: authenticatedProcedure.input(mediaIdInput).mutation(async ({ ctx, input }) => {
    let storageKey: string | null = null;
    if (ctx.db.kind === 'mysql') {
      const t = ctx.db.schema.mediaAssets;
      const rows = await ctx.db.db
        .select({ storageKey: t.storageKey })
        .from(t as unknown as MySqlTable)
        .where(eq(t.id, input.id))
        .limit(1);
      const row = (rows as unknown as Array<{ storageKey?: string }>)[0];
      storageKey = row?.storageKey ?? null;
    } else {
      const t = ctx.db.schema.mediaAssets;
      const rows = await ctx.db.db
        .select({ storageKey: t.storageKey })
        .from(t as unknown as PgTable)
        .where(eq(t.id, input.id))
        .limit(1);
      const row = (rows as unknown as Array<{ storageKey?: string }>)[0];
      storageKey = row?.storageKey ?? null;
    }
    if (storageKey === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Файл не найден.' });
    }

    if (ctx.state.storage) {
      try {
        await ctx.state.storage.deleteObject(storageKey);
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Не удалось удалить файл из хранилища: ${(err as Error).message}`,
        });
      }
    }

    if (ctx.db.kind === 'mysql') {
      const t = ctx.db.schema.mediaAssets;
      await ctx.db.db.delete(t).where(eq(t.id, input.id));
    } else {
      const t = ctx.db.schema.mediaAssets;
      await ctx.db.db.delete(t).where(eq(t.id, input.id));
    }
    return { ok: true } as const;
  }),
});

async function selectTrashedDocs(
  db: MineDb,
  table: MySqlTable | PgTable,
  limit: number,
  offset: number,
): Promise<Record<string, unknown>[]> {
  const deletedCol = (table as unknown as Record<string, unknown>).deleted_at as never;
  if (db.kind === 'mysql') {
    return db.db
      .select()
      .from(table as MySqlTable)
      .where(isNotNull(deletedCol))
      .orderBy(desc(deletedCol))
      .limit(limit)
      .offset(offset);
  }
  return db.db
    .select()
    .from(table as PgTable)
    .where(isNotNull(deletedCol))
    .orderBy(desc(deletedCol))
    .limit(limit)
    .offset(offset);
}

async function countTrashedDocs(db: MineDb, table: MySqlTable | PgTable): Promise<number> {
  const deletedCol = (table as unknown as Record<string, unknown>).deleted_at as never;
  if (db.kind === 'mysql') {
    const rows = await db.db
      .select({ value: count() })
      .from(table as MySqlTable)
      .where(isNotNull(deletedCol));
    return Number(rows[0]?.value ?? 0);
  }
  const rows = await db.db
    .select({ value: count() })
    .from(table as PgTable)
    .where(isNotNull(deletedCol));
  return Number(rows[0]?.value ?? 0);
}

async function fetchTrashedMedia(
  db: MineDb,
  limit: number,
  offset: number,
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  if (db.kind === 'mysql') {
    const t = db.schema.mediaAssets;
    const rows = await db.db
      .select()
      .from(t as unknown as MySqlTable)
      .where(isNotNull(t.deletedAt))
      .orderBy(desc(t.deletedAt))
      .limit(limit)
      .offset(offset);
    const totals = await db.db
      .select({ value: count() })
      .from(t as unknown as MySqlTable)
      .where(isNotNull(t.deletedAt));
    return {
      rows: rows as unknown as Record<string, unknown>[],
      total: Number(totals[0]?.value ?? 0),
    };
  }
  const t = db.schema.mediaAssets;
  const rows = await db.db
    .select()
    .from(t as unknown as PgTable)
    .where(isNotNull(t.deletedAt))
    .orderBy(desc(t.deletedAt))
    .limit(limit)
    .offset(offset);
  const totals = await db.db
    .select({ value: count() })
    .from(t as unknown as PgTable)
    .where(isNotNull(t.deletedAt));
  return {
    rows: rows as unknown as Record<string, unknown>[],
    total: Number(totals[0]?.value ?? 0),
  };
}

async function countTrashedMedia(db: MineDb): Promise<number> {
  if (db.kind === 'mysql') {
    const t = db.schema.mediaAssets;
    const rows = await db.db
      .select({ value: count() })
      .from(t as unknown as MySqlTable)
      .where(isNotNull(t.deletedAt));
    return Number(rows[0]?.value ?? 0);
  }
  const t = db.schema.mediaAssets;
  const rows = await db.db
    .select({ value: count() })
    .from(t as unknown as PgTable)
    .where(isNotNull(t.deletedAt));
  return Number(rows[0]?.value ?? 0);
}
