import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { MySqlTable } from 'drizzle-orm/mysql-core';
import type { PgTable } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { MineDb } from '../../db';
import { type MediaAssetRow, rowToAsset } from '../../media/upload-handler';
import { router, TRPCError } from '../core';
import { authenticatedProcedure } from '../middlewares';

const idInput = z.object({ id: z.number().int().positive() });
const idsInput = z.object({
  ids: z.array(z.number().int().positive()).max(200),
});
const listInput = z.object({
  limit: z.number().int().positive().max(200).default(50),
  offset: z.number().int().nonnegative().default(0),
});
const updateInput = idInput.extend({
  alt: z.string().max(500).nullable().optional(),
});

/**
 * Сериализует строку `media_assets` для tRPC-ответа: добавляет
 * `viewUrl` (signed или public) и приводит даты к ISO-строкам — в JSON
 * `Date` иначе превратится в `{}`.
 */
async function serialize(args: {
  state: import('../../state').ServerState;
  asset: MediaAssetRow;
}): Promise<Record<string, unknown>> {
  const { state, asset } = args;
  const viewUrl = state.storage ? await state.storage.getViewUrl(asset.storageKey) : null;
  return {
    id: asset.id,
    storageKey: asset.storageKey,
    originalFilename: asset.originalFilename,
    mimeType: asset.mimeType,
    size: asset.size,
    width: asset.width,
    height: asset.height,
    sha1: asset.sha1,
    alt: asset.alt,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
    deletedAt: asset.deletedAt === null ? null : asset.deletedAt.toISOString(),
    viewUrl,
  };
}

/**
 * tRPC-роутер для медиа-ассетов. Все процедуры требуют валидной сессии —
 * Studio-only. Анонимный доступ к содержимому хранилища идёт исключительно
 * через подписанные URL, которые генерирует REST-слой `expand-images`,
 * и **только** для опубликованных документов (фильтр в `plugins/rest.ts`).
 *
 * Важно: загрузка файлов идёт **не через tRPC**, а через REST-эндпоинт
 * `POST /api/v1/media/upload` — multipart/form-data плохо ложится на
 * JSON-сериализацию tRPC-batched-link. Этот эндпоинт защищён сессией
 * в `plugins/media.ts` через ту же `loadSessionPrincipal`.
 */
export const mediaRouter = router({
  /** Список с пагинацией и сортировкой по `created_at desc`. */
  list: authenticatedProcedure.input(listInput).query(async ({ ctx, input }) => {
    const { rows, total } = await fetchAssets(ctx.db, input.limit, input.offset);
    const items = await Promise.all(
      rows.map((row) => serialize({ state: ctx.state, asset: rowToAsset(row) })),
    );
    return { items, total, limit: input.limit, offset: input.offset };
  }),

  /** Один ассет по id. */
  get: authenticatedProcedure.input(idInput).query(async ({ ctx, input }) => {
    const asset = await readAsset(ctx.db, input.id);
    return { item: await serialize({ state: ctx.state, asset }) };
  }),

  /**
   * Пакетная загрузка ассетов по списку id. Используется списками документов,
   * чтобы за один запрос подтянуть превьюшки cover-изображений всех строк
   * (вместо N отдельных `media.get`). Несуществующие id молча отбрасываются.
   */
  getMany: authenticatedProcedure.input(idsInput).query(async ({ ctx, input }) => {
    if (input.ids.length === 0) {
      return { items: [] as Record<string, unknown>[] };
    }
    const rows = await fetchAssetsByIds(ctx.db, input.ids);
    const items = await Promise.all(
      rows.map((row) => serialize({ state: ctx.state, asset: rowToAsset(row) })),
    );
    return { items };
  }),

  /** Изменение мета-полей ассета (на сегодня — только `alt`). */
  update: authenticatedProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
    const altValue = input.alt === undefined ? null : input.alt;
    if (ctx.db.kind === 'mysql') {
      const t = ctx.db.schema.mediaAssets;
      await ctx.db.db.update(t).set({ alt: altValue }).where(eq(t.id, input.id));
    } else {
      const t = ctx.db.schema.mediaAssets;
      await ctx.db.db.update(t).set({ alt: altValue }).where(eq(t.id, input.id));
    }
    const asset = await readAsset(ctx.db, input.id);
    return { item: await serialize({ state: ctx.state, asset }) };
  }),

  /**
   * Soft delete: помечает ассет `deleted_at = NOW()`. Файл в S3 не трогаем —
   * это сделает `trash.purge` (hard delete). Документы могут продолжать
   * ссылаться на assetId; expandImageFields ниже фильтрует удалённые и отдаёт
   * `image: null` на публичной стороне.
   */
  delete: authenticatedProcedure.input(idInput).mutation(async ({ ctx, input }) => {
    await readAsset(ctx.db, input.id); // throws NOT_FOUND если ассета нет
    const now = new Date();
    if (ctx.db.kind === 'mysql') {
      const t = ctx.db.schema.mediaAssets;
      await ctx.db.db.update(t).set({ deletedAt: now }).where(eq(t.id, input.id));
    } else {
      const t = ctx.db.schema.mediaAssets;
      await ctx.db.db.update(t).set({ deletedAt: now }).where(eq(t.id, input.id));
    }
    return { ok: true } as const;
  }),
});

/**
 * Drizzle разводит mysql/pg типы отдельно, поэтому единый builder невозможен —
 * сужаем по `db.kind`, чтобы TS подобрал нужную сигнатуру `select().from()`.
 */
async function fetchAssets(
  db: MineDb,
  limit: number,
  offset: number,
): Promise<{ rows: Record<string, unknown>[]; total: number }> {
  if (db.kind === 'mysql') {
    const t = db.schema.mediaAssets;
    const rows = await db.db
      .select()
      .from(t as unknown as MySqlTable)
      .where(isNull(t.deletedAt))
      .orderBy(desc(t.createdAt))
      .limit(limit)
      .offset(offset);
    const totals = await db.db
      .select({ value: count() })
      .from(t as unknown as MySqlTable)
      .where(isNull(t.deletedAt));
    return {
      rows: rows as unknown as Record<string, unknown>[],
      total: Number(totals[0]?.value ?? 0),
    };
  }
  const t = db.schema.mediaAssets;
  const rows = await db.db
    .select()
    .from(t as unknown as PgTable)
    .where(isNull(t.deletedAt))
    .orderBy(desc(t.createdAt))
    .limit(limit)
    .offset(offset);
  const totals = await db.db
    .select({ value: count() })
    .from(t as unknown as PgTable)
    .where(isNull(t.deletedAt));
  return {
    rows: rows as unknown as Record<string, unknown>[],
    total: Number(totals[0]?.value ?? 0),
  };
}

/**
 * Загружает несколько ассетов одним SELECT по `IN (...)`. Дубли в `ids`
 * не проверяем — БД сама их свернёт; вызывающий пусть фильтрует на свою сторону.
 */
async function fetchAssetsByIds(
  db: MineDb,
  ids: readonly number[],
): Promise<Record<string, unknown>[]> {
  if (db.kind === 'mysql') {
    const t = db.schema.mediaAssets;
    const rows = await db.db
      .select()
      .from(t as unknown as MySqlTable)
      .where(and(inArray(t.id, ids as number[]), isNull(t.deletedAt)));
    return rows as unknown as Record<string, unknown>[];
  }
  const t = db.schema.mediaAssets;
  const rows = await db.db
    .select()
    .from(t as unknown as PgTable)
    .where(and(inArray(t.id, ids as number[]), isNull(t.deletedAt)));
  return rows as unknown as Record<string, unknown>[];
}

async function readAsset(db: MineDb, id: number): Promise<MediaAssetRow> {
  if (db.kind === 'mysql') {
    const t = db.schema.mediaAssets;
    const rows = await db.db
      .select()
      .from(t as unknown as MySqlTable)
      .where(and(eq(t.id, id), isNull(t.deletedAt)))
      .limit(1);
    const row = (rows as unknown as Record<string, unknown>[])[0];
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Файл не найден.' });
    return rowToAsset(row);
  }
  const t = db.schema.mediaAssets;
  const rows = await db.db
    .select()
    .from(t as unknown as PgTable)
    .where(and(eq(t.id, id), isNull(t.deletedAt)))
    .limit(1);
  const row = (rows as unknown as Record<string, unknown>[])[0];
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Файл не найден.' });
  return rowToAsset(row);
}
