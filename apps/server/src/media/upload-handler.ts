import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { MySqlTable } from 'drizzle-orm/mysql-core';
import type { PgTable } from 'drizzle-orm/pg-core';
import { imageSize } from 'image-size';
import type { MineDb } from '../db';
import type { ServerState } from '../state';
import { generateObjectKey } from './storage';

/**
 * Минимальный whitelist поддерживаемых mime-типов для загрузки. Преднамеренно
 * консервативный: AVIF/HEIC и SVG требуют доп. валидации (active content в SVG)
 * и пока не входят в Phase 13.
 */
export const SUPPORTED_IMAGE_MIME = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

export interface UploadInput {
  filename: string;
  mimetype: string;
  body: Buffer;
}

export interface MediaAssetRow {
  id: number;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  sha1: string;
  alt: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Soft delete marker. NULL → активный, иначе ассет в корзине. */
  deletedAt: Date | null;
}

/**
 * Пишет файл в БД + S3.
 *
 * Шаги:
 * 1. Считаем sha1 от тела файла. Если в БД уже есть строка с таким хешем —
 *    возвращаем её, чтобы один и тот же файл не дублировался в bucket'е.
 * 2. Пытаемся вытащить размеры (width/height) через `image-size` — он работает
 *    на буфере и поддерживает все форматы из {@link SUPPORTED_IMAGE_MIME}.
 * 3. Заливаем в S3, потом пишем строку — обратный порядок (БД сначала)
 *    дал бы «осиротевшие» записи в БД, которые ссылаются на не существующий
 *    объект. Здесь возможен «осиротевший» объект в S3 (если БД упала после
 *    putObject) — это меньшее зло и зачищается батч-уборщиком.
 */
export async function saveUploadedAsset(args: {
  db: MineDb;
  state: ServerState;
  input: UploadInput;
}): Promise<MediaAssetRow> {
  const { db, state, input } = args;
  const { storage } = state;
  if (!storage) {
    throw new Error('Хранилище медиа не сконфигурировано (S3_*)');
  }

  if (!SUPPORTED_IMAGE_MIME.has(input.mimetype)) {
    throw new Error(`Mime-тип "${input.mimetype}" не поддерживается.`);
  }

  const sha1 = createHash('sha1').update(input.body).digest('hex');

  const existing = await findAssetBySha1(db, sha1);
  if (existing) {
    return existing;
  }

  const dimensions = readImageSize(input.body);

  const key = generateObjectKey({
    prefix: state.config.storage?.keyPrefix ?? 'media',
    originalFilename: input.filename,
    sha1,
  });

  await storage.putObject({
    key,
    body: input.body,
    contentType: input.mimetype,
    contentDisposition: `inline; filename="${encodeURIComponent(input.filename)}"`,
  });

  if (db.kind === 'mysql') {
    const t = db.schema.mediaAssets;
    const result = await db.db.insert(t as unknown as MySqlTable).values({
      storageKey: key,
      originalFilename: input.filename,
      mimeType: input.mimetype,
      size: input.body.length,
      width: dimensions.width,
      height: dimensions.height,
      sha1,
      alt: null,
    } as never);
    const insertId = (result as unknown as Array<{ insertId?: number }>)[0]?.insertId ?? 0;
    const inserted = await findAssetBySha1(db, sha1);
    if (!inserted) {
      throw new Error(`Failed to read back inserted media asset (id=${insertId}).`);
    }
    return inserted;
  }

  const t = db.schema.mediaAssets;
  const inserted = await db.db
    .insert(t as unknown as PgTable)
    .values({
      storageKey: key,
      originalFilename: input.filename,
      mimeType: input.mimetype,
      size: input.body.length,
      width: dimensions.width,
      height: dimensions.height,
      sha1,
      alt: null,
    } as never)
    .returning();
  const row = (inserted as unknown as Record<string, unknown>[])[0];
  if (!row) throw new Error('Insert returned no row');
  return rowToAsset(row);
}

/**
 * Безопасно вызывает `image-size` — он бросает на нечитаемых файлах. В нашем
 * случае нечитаемая картинка — не повод валить весь upload, метаданные размеров
 * необязательны, поэтому ошибки молча преобразуем в `null`.
 */
function readImageSize(buffer: Buffer): { width: number | null; height: number | null } {
  try {
    const dim = imageSize(buffer);
    return {
      width: typeof dim.width === 'number' ? dim.width : null,
      height: typeof dim.height === 'number' ? dim.height : null,
    };
  } catch {
    return { width: null, height: null };
  }
}

async function findAssetBySha1(db: MineDb, sha1: string): Promise<MediaAssetRow | null> {
  // Дедупликация — только среди активных ассетов. Ассеты в корзине игнорируем:
  // после purge их sha1 освобождается, а до purge — новый upload создаёт новую
  // запись, чтобы restore из trash не конфликтовал с уже сохранённой ссылкой.
  if (db.kind === 'mysql') {
    const t = db.schema.mediaAssets;
    const rows = await db.db
      .select()
      .from(t as unknown as MySqlTable)
      .where(and(eq(t.sha1, sha1), isNull(t.deletedAt)))
      .limit(1);
    const first = (rows as unknown as Record<string, unknown>[])[0];
    return first ? rowToAsset(first) : null;
  }
  const t = db.schema.mediaAssets;
  const rows = await db.db
    .select()
    .from(t as unknown as PgTable)
    .where(and(eq(t.sha1, sha1), isNull(t.deletedAt)))
    .limit(1);
  const first = (rows as unknown as Record<string, unknown>[])[0];
  return first ? rowToAsset(first) : null;
}

/**
 * Нормализует строку Drizzle (mysql/pg) к единому формату `MediaAssetRow`,
 * с числовыми `size` и явно `null`-ами для опциональных полей.
 */
export function rowToAsset(row: Record<string, unknown>): MediaAssetRow {
  return {
    id: Number(row.id),
    storageKey: String(row.storageKey ?? row.storage_key ?? ''),
    originalFilename: String(row.originalFilename ?? row.original_filename ?? ''),
    mimeType: String(row.mimeType ?? row.mime_type ?? ''),
    size: Number(row.size ?? 0),
    width: row.width === null || row.width === undefined ? null : Number(row.width),
    height: row.height === null || row.height === undefined ? null : Number(row.height),
    sha1: String(row.sha1 ?? ''),
    alt: row.alt === null || row.alt === undefined ? null : String(row.alt),
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt
        : new Date(String(row.created_at ?? row.createdAt ?? Date.now())),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt
        : new Date(String(row.updated_at ?? row.updatedAt ?? Date.now())),
    deletedAt: parseNullableDate(row.deletedAt ?? row.deleted_at),
  };
}

function parseNullableDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}
