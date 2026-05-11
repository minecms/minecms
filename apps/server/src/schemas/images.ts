import type { FieldDefinition, SchemaDefinition } from '@minecms/core';
import { and, eq, isNull } from 'drizzle-orm';
import type { MySqlTable } from 'drizzle-orm/mysql-core';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { MineDb } from '../db';

/**
 * Один найденный image-usage в дереве документа. Зеркальная аналогия с
 * `ReferenceUsage`: `path` помогает в сообщении об ошибке, `assetId` — само
 * значение, которое надо проверить в `media_assets`.
 */
export interface ImageUsage {
  path: string;
  assetId: number;
}

/**
 * Рекурсивно собирает все `image`-значения из документа.
 *
 * Вызывается после Zod-валидации, поэтому форма данных уже соответствует
 * схеме. Не путать с `richText` — `richText` остаётся скаляром без assetId.
 */
export function collectImageUsages(
  schema: SchemaDefinition,
  data: Record<string, unknown>,
): ImageUsage[] {
  const out: ImageUsage[] = [];
  for (const [key, field] of Object.entries(schema.fields)) {
    walk(field, (data as Record<string, unknown>)[key], key, out);
  }
  return out;
}

function walk(field: FieldDefinition, value: unknown, path: string, out: ImageUsage[]): void {
  if (value === null || value === undefined) return;

  switch (field.type) {
    case 'image': {
      if (typeof value === 'object' && !Array.isArray(value)) {
        const obj = value as { assetId?: unknown };
        if (typeof obj.assetId === 'number' && obj.assetId > 0) {
          out.push({ path, assetId: obj.assetId });
        }
      }
      return;
    }
    case 'object': {
      if (typeof value !== 'object') return;
      const obj = value as Record<string, unknown>;
      for (const [subKey, subField] of Object.entries(field.fields)) {
        walk(subField, obj[subKey], `${path}.${subKey}`, out);
      }
      return;
    }
    case 'array': {
      if (!Array.isArray(value)) return;
      value.forEach((item, idx) => {
        walk(field.of, item, `${path}[${idx}]`, out);
      });
      return;
    }
    case 'union': {
      if (typeof value !== 'object') return;
      const obj = value as Record<string, unknown>;
      const disc = field.discriminator ?? 'kind';
      const variantKey = obj[disc];
      if (typeof variantKey !== 'string') return;
      const variant = field.variants[variantKey];
      if (!variant) return;
      for (const [subKey, subField] of Object.entries(variant.fields)) {
        walk(subField, obj[subKey], `${path}.${subKey}`, out);
      }
      return;
    }
    default:
      return;
  }
}

/**
 * Проверяет, что для каждого `image`-usage есть строка в `media_assets`.
 * Возвращает первый битый usage или `null`, если все на месте.
 */
export async function findBrokenImage(
  db: MineDb,
  usages: ImageUsage[],
): Promise<ImageUsage | null> {
  if (usages.length === 0) return null;
  // Активным считается ассет без `deleted_at`. Ссылка на ассет в корзине
  // блокируется здесь — Studio покажет ошибку при сохранении.
  for (const usage of usages) {
    if (db.kind === 'mysql') {
      const t = db.schema.mediaAssets;
      const rows = await db.db
        .select({ id: t.id })
        .from(t as unknown as MySqlTable)
        .where(and(eq(t.id, usage.assetId), isNull(t.deletedAt)))
        .limit(1);
      if (rows.length === 0) return usage;
    } else {
      const t = db.schema.mediaAssets;
      const rows = await db.db
        .select({ id: t.id })
        .from(t as unknown as PgTable)
        .where(and(eq(t.id, usage.assetId), isNull(t.deletedAt)))
        .limit(1);
      if (rows.length === 0) return usage;
    }
  }
  return null;
}
