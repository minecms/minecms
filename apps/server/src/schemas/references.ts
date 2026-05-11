import type { FieldDefinition, SchemaDefinition } from '@minecms/core';
import { and, eq, isNull, type SQL, sql } from 'drizzle-orm';
import type { MySqlTable } from 'drizzle-orm/mysql-core';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { MineDb } from '../db';
import type { ServerState } from '../state';

/**
 * Одна найденная ссылка в дереве документа: `path` указывает место в JSON
 * (для сообщений об ошибках), `to` — список допустимых целевых схем,
 * `id` — само значение ссылки (положительное целое).
 */
export interface ReferenceUsage {
  path: string;
  to: readonly string[];
  id: number;
}

/**
 * Рекурсивно собирает все `reference`-значения из документа на основании схемы.
 *
 * Вызывается **после** Zod-валидации, поэтому форма данных уже соответствует схеме —
 * ветвь `union` определяется по полю-дискриминатору, элементы `array` обходятся
 * по индексам, `object` — по своим `fields`.
 */
export function collectReferenceUsages(
  schema: SchemaDefinition,
  data: Record<string, unknown>,
): ReferenceUsage[] {
  const out: ReferenceUsage[] = [];
  for (const [key, field] of Object.entries(schema.fields)) {
    walk(field, (data as Record<string, unknown>)[key], key, out);
  }
  return out;
}

function walk(field: FieldDefinition, value: unknown, path: string, out: ReferenceUsage[]): void {
  if (value === null || value === undefined) return;

  switch (field.type) {
    case 'reference': {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        out.push({ path, to: field.to, id: value });
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
      // Скаляры — нечего обходить.
      return;
  }
}

/**
 * Проверяет, что для каждой ссылки в `usages` существует документ хотя бы в одной из
 * её целевых схем. Если документа нет ни в одной — возвращает первый сломанный usage.
 *
 * Возвращает `null`, если все ссылки валидны.
 */
export async function findBrokenReference(
  db: MineDb,
  state: ServerState,
  usages: ReferenceUsage[],
): Promise<ReferenceUsage | null> {
  if (usages.length === 0) return null;

  for (const usage of usages) {
    const found = await refExistsInAny(db, state, usage.to, usage.id);
    if (!found) return usage;
  }
  return null;
}

async function refExistsInAny(
  db: MineDb,
  state: ServerState,
  to: readonly string[],
  id: number,
): Promise<boolean> {
  for (const schemaName of to) {
    const tables = db.kind === 'mysql' ? state.userTables.mysql : state.userTables.postgres;
    const table = tables.bySchemaName[schemaName];
    if (!table) continue;
    const idColumn = (table as unknown as Record<string, unknown>).id as never;
    const deletedColumn = (table as unknown as Record<string, unknown>).deleted_at;
    const baseEq = eq(idColumn, id as never);
    const where: SQL = deletedColumn
      ? (and(baseEq, isNull(deletedColumn as never)) as SQL)
      : baseEq;
    if (db.kind === 'mysql') {
      const rows = await db.db
        .select({ value: sql<number>`1` })
        .from(table as MySqlTable)
        .where(where)
        .limit(1);
      if (rows.length > 0) return true;
    } else {
      const rows = await db.db
        .select({ value: sql<number>`1` })
        .from(table as PgTable)
        .where(where)
        .limit(1);
      if (rows.length > 0) return true;
    }
  }
  return false;
}
