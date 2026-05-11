import type { FieldDefinition, SchemaDefinition } from '@minecms/core';
import { and, inArray, isNull } from 'drizzle-orm';
import type { MySqlTable } from 'drizzle-orm/mysql-core';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { MineDb } from '../db';
import { rowToAsset } from '../media/upload-handler';
import type { ServerState } from '../state';

/**
 * Расширенное значение image-поля, отдаваемое публичным REST API.
 *
 * `assetId` остаётся, чтобы клиент мог сослаться на ассет (например, для
 * pre-fetch других изображений). `url` готов к подстановке в `<img src>` —
 * presigned-ссылка с TTL=1ч (см. `MediaStorage.getViewUrl`) либо прямая
 * публичная ссылка, если в конфиге задан `S3_PUBLIC_URL`.
 *
 * `alt` приходит из значения поля документа (контекстный alt) и берётся
 * из той же JSON-структуры, что лежит в БД.
 */
export type ExpandedImageValue = {
  assetId: number;
  alt?: string;
  url: string;
  width: number | null;
  height: number | null;
  mimeType: string;
};

/**
 * Один найденный image-«дырочка» в дереве документа: позиция, ссылка на
 * ассет и опциональный alt. После раскрытия `setExpanded` подставляет
 * `ExpandedImageValue` ровно туда, где раньше лежало `{ assetId, alt? }`.
 */
interface ImageHole {
  assetId: number;
  alt?: string;
  setExpanded: (value: ExpandedImageValue) => void;
}

/**
 * Раскрывает все `image`-поля в строках REST-ответа: вместо
 * `{ assetId, alt? }` клиент получает
 * `{ assetId, alt?, url, width, height, mimeType }`.
 *
 * Один SELECT по `media_assets WHERE id IN (...)` для всех уникальных
 * `assetId` сразу — без N+1. Резолв URL'ов параллельный (presigned может
 * быть медленным).
 *
 * Поведение при отсутствии image-полей: ранний выход, никакого overhead.
 * Отсутствующий ассет (битая ссылка) — поле остаётся как было,
 * без подмены: клиент увидит сырой `{ assetId, alt? }` и сможет
 * показать заглушку.
 */
export async function expandImageFields(
  state: ServerState,
  schema: SchemaDefinition,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) return;
  if (!schemaHasImageField(schema)) return;

  const holes: ImageHole[] = [];
  for (const row of rows) {
    for (const [key, field] of Object.entries(schema.fields)) {
      const localKey = key;
      walkValue(
        field,
        row[localKey],
        (next) => {
          row[localKey] = next;
        },
        holes,
      );
    }
  }
  if (holes.length === 0) return;

  const db = state.db;
  if (!db) return;

  const ids = Array.from(new Set(holes.map((h) => h.assetId)));
  const assets = await fetchAssetsByIds(db, ids);
  const byId = new Map<number, MediaAssetInfo>();
  for (const asset of assets) byId.set(asset.id, asset);

  const storage = state.storage;
  const urlById = new Map<number, string>();
  if (storage) {
    await Promise.all(
      assets.map(async (asset) => {
        const url = await storage.getViewUrl(asset.storageKey);
        urlById.set(asset.id, url);
      }),
    );
  }

  for (const hole of holes) {
    const asset = byId.get(hole.assetId);
    if (!asset) continue;
    const url = urlById.get(hole.assetId);
    if (url === undefined) continue;
    const expanded: ExpandedImageValue = {
      assetId: asset.id,
      ...(hole.alt !== undefined ? { alt: hole.alt } : {}),
      url,
      width: asset.width,
      height: asset.height,
      mimeType: asset.mimeType,
    };
    hole.setExpanded(expanded);
  }
}

/** Быстрая проверка: есть ли в схеме хоть одно `image`-поле (учитывая вложенные). */
export function schemaHasImageField(schema: SchemaDefinition): boolean {
  for (const field of Object.values(schema.fields)) {
    if (fieldHasImage(field)) return true;
  }
  return false;
}

function fieldHasImage(field: FieldDefinition): boolean {
  switch (field.type) {
    case 'image':
      return true;
    case 'object':
      return Object.values(field.fields).some(fieldHasImage);
    case 'array':
      return fieldHasImage(field.of);
    case 'union':
      return Object.values(field.variants).some((variant) =>
        Object.values(variant.fields).some(fieldHasImage),
      );
    default:
      return false;
  }
}

/**
 * Рекурсивный обход значения по описанию поля. Когда встречается image —
 * запоминаем «дырочку» с сеттером для подстановки расширенного значения.
 *
 * Передача `setValue` вместо «parent + key» нужна, чтобы безопасно работать
 * с массивами (числовые ключи) и объектами (строковые) одним кодом.
 */
function walkValue(
  field: FieldDefinition,
  value: unknown,
  setValue: (next: unknown) => void,
  holes: ImageHole[],
): void {
  if (value === null || value === undefined) return;

  switch (field.type) {
    case 'image': {
      if (typeof value !== 'object' || Array.isArray(value)) return;
      const obj = value as { assetId?: unknown; alt?: unknown };
      if (typeof obj.assetId !== 'number' || obj.assetId <= 0) return;
      holes.push({
        assetId: obj.assetId,
        ...(typeof obj.alt === 'string' ? { alt: obj.alt } : {}),
        setExpanded: (next) => setValue(next),
      });
      return;
    }
    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value)) return;
      const obj = value as Record<string, unknown>;
      for (const [subKey, subField] of Object.entries(field.fields)) {
        walkValue(
          subField,
          obj[subKey],
          (next) => {
            obj[subKey] = next;
          },
          holes,
        );
      }
      return;
    }
    case 'array': {
      if (!Array.isArray(value)) return;
      value.forEach((item, idx) => {
        walkValue(
          field.of,
          item,
          (next) => {
            value[idx] = next;
          },
          holes,
        );
      });
      return;
    }
    case 'union': {
      if (typeof value !== 'object' || Array.isArray(value)) return;
      const obj = value as Record<string, unknown>;
      const disc = field.discriminator ?? 'kind';
      const variantKey = obj[disc];
      if (typeof variantKey !== 'string') return;
      const variant = field.variants[variantKey];
      if (!variant) return;
      for (const [subKey, subField] of Object.entries(variant.fields)) {
        walkValue(
          subField,
          obj[subKey],
          (next) => {
            obj[subKey] = next;
          },
          holes,
        );
      }
      return;
    }
    default:
      return;
  }
}

/**
 * Минимальный срез строки `media_assets`, которого хватает для расширения
 * image-поля в публичном API. Полная `MediaAssetRow` сюда не нужна.
 */
interface MediaAssetInfo {
  id: number;
  storageKey: string;
  width: number | null;
  height: number | null;
  mimeType: string;
}

async function fetchAssetsByIds(db: MineDb, ids: number[]): Promise<MediaAssetInfo[]> {
  if (ids.length === 0) return [];
  // Soft-deleted ассеты на публику не отдаём — клиент увидит сырой `{ assetId }`
  // без расширения (тем же путём, что и битая ссылка).
  if (db.kind === 'mysql') {
    const t = db.schema.mediaAssets;
    const rows = await db.db
      .select()
      .from(t as unknown as MySqlTable)
      .where(and(inArray(t.id, ids), isNull(t.deletedAt)));
    return (rows as unknown as Record<string, unknown>[]).map(toInfo);
  }
  const t = db.schema.mediaAssets;
  const rows = await db.db
    .select()
    .from(t as unknown as PgTable)
    .where(and(inArray(t.id, ids), isNull(t.deletedAt)));
  return (rows as unknown as Record<string, unknown>[]).map(toInfo);
}

function toInfo(row: Record<string, unknown>): MediaAssetInfo {
  const asset = rowToAsset(row);
  return {
    id: asset.id,
    storageKey: asset.storageKey,
    width: asset.width,
    height: asset.height,
    mimeType: asset.mimeType,
  };
}

/**
 * Тестовый хук: возвращает «дырочки» без обращения к БД.
 * Не используется в проде, экспонирован только для unit-тестов walker'а.
 */
export function _collectImageHolesForTests(
  schema: SchemaDefinition,
  rows: Record<string, unknown>[],
): Array<{ assetId: number; alt?: string }> {
  const holes: ImageHole[] = [];
  for (const row of rows) {
    for (const [key, field] of Object.entries(schema.fields)) {
      const localKey = key;
      walkValue(
        field,
        row[localKey],
        (next) => {
          row[localKey] = next;
        },
        holes,
      );
    }
  }
  return holes.map((h) => ({ assetId: h.assetId, ...(h.alt !== undefined ? { alt: h.alt } : {}) }));
}
