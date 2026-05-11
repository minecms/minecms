import type { FieldDefinition, SchemaDefinition } from '@minecms/core';
import { sql } from 'drizzle-orm';
import {
  type MySqlTable,
  bigint as mysqlBigint,
  boolean as mysqlBoolean,
  double as mysqlDouble,
  int as mysqlInt,
  json as mysqlJson,
  mysqlTable,
  text as mysqlText,
  timestamp as mysqlTimestamp,
  varchar as mysqlVarchar,
} from 'drizzle-orm/mysql-core';
import {
  type PgTable,
  bigint as pgBigint,
  bigserial as pgBigserial,
  boolean as pgBoolean,
  doublePrecision as pgDoublePrecision,
  integer as pgInteger,
  jsonb as pgJsonb,
  pgTable,
  text as pgText,
  timestamp as pgTimestamp,
  varchar as pgVarchar,
} from 'drizzle-orm/pg-core';
import { schemaToTableName } from './reserved';

/** Колонки, которые сервер всегда добавляет в пользовательские таблицы. */
export const SYSTEM_COLUMNS = ['id', 'created_at', 'updated_at', 'deleted_at'] as const;

const DEFAULT_VARCHAR_LENGTH = 255;
const SLUG_DEFAULT_LENGTH = 191;

/**
 * Универсальный набор пользовательских таблиц — оба диалекта строятся из одного
 * описания. Под каждый диалект Drizzle отдаёт свой объект таблицы, который потом
 * скармливается `pushMySQLSchema`/`pushSchema`.
 */
export interface UserTables<T> {
  /** Map: имя схемы (как в `defineSchema`) → Drizzle-таблица. */
  bySchemaName: Record<string, T>;
  /** Map: имя SQL-таблицы (snake_case) → Drizzle-таблица. */
  byTableName: Record<string, T>;
}

/**
 * Строит набор Drizzle-таблиц под MySQL из пользовательских схем.
 * Один проход; каждая колонка маппится из `FieldDefinition`.
 */
export function buildMysqlUserTables(schemas: SchemaDefinition[]): UserTables<MySqlTable> {
  const bySchemaName: Record<string, MySqlTable> = {};
  const byTableName: Record<string, MySqlTable> = {};

  for (const schema of schemas) {
    const tableName = schemaToTableName(schema.name);
    const columns = buildMysqlColumns(schema);
    const table = mysqlTable(tableName, columns);
    bySchemaName[schema.name] = table;
    byTableName[tableName] = table;
  }

  return { bySchemaName, byTableName };
}

/**
 * Строит набор Drizzle-таблиц под PostgreSQL из пользовательских схем.
 */
export function buildPostgresUserTables(schemas: SchemaDefinition[]): UserTables<PgTable> {
  const bySchemaName: Record<string, PgTable> = {};
  const byTableName: Record<string, PgTable> = {};

  for (const schema of schemas) {
    const tableName = schemaToTableName(schema.name);
    const columns = buildPostgresColumns(schema);
    const table = pgTable(tableName, columns);
    bySchemaName[schema.name] = table;
    byTableName[tableName] = table;
  }

  return { bySchemaName, byTableName };
}

function buildMysqlColumns(
  schema: SchemaDefinition,
): Record<string, ReturnType<typeof mysqlVarchar>> {
  const columns: Record<string, unknown> = {
    id: mysqlBigint('id', { mode: 'number', unsigned: true }).primaryKey().autoincrement(),
  };

  for (const [key, field] of Object.entries(schema.fields)) {
    columns[key] = mysqlColumnFor(key, field);
  }

  if (schema.timestamps !== false) {
    columns.created_at = mysqlTimestamp('created_at', { mode: 'date' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`);
    columns.updated_at = mysqlTimestamp('updated_at', { mode: 'date' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .onUpdateNow();
  }

  // deleted_at — soft delete marker. Не привязан к `timestamps: false`: даже
  // схемы без аудит-таймстампов должны поддерживать корзину единообразно.
  columns.deleted_at = mysqlTimestamp('deleted_at', { mode: 'date' });

  return columns as Record<string, ReturnType<typeof mysqlVarchar>>;
}

function buildPostgresColumns(
  schema: SchemaDefinition,
): Record<string, ReturnType<typeof pgVarchar>> {
  const columns: Record<string, unknown> = {
    id: pgBigserial('id', { mode: 'number' }).primaryKey(),
  };

  for (const [key, field] of Object.entries(schema.fields)) {
    columns[key] = postgresColumnFor(key, field);
  }

  if (schema.timestamps !== false) {
    columns.created_at = pgTimestamp('created_at', { mode: 'date', withTimezone: true })
      .notNull()
      .default(sql`now()`);
    columns.updated_at = pgTimestamp('updated_at', { mode: 'date', withTimezone: true })
      .notNull()
      .default(sql`now()`);
  }

  // deleted_at — soft delete marker. См. JSDoc в MySQL-варианте выше.
  columns.deleted_at = pgTimestamp('deleted_at', { mode: 'date', withTimezone: true });

  return columns as Record<string, ReturnType<typeof pgVarchar>>;
}

// biome-ignore lint/suspicious/noExplicitAny: Drizzle-колонки — разные типы, объединяем общим any.
function mysqlColumnFor(name: string, field: FieldDefinition): any {
  switch (field.type) {
    case 'string': {
      const length = field.max ?? DEFAULT_VARCHAR_LENGTH;
      const col = mysqlVarchar(name, { length });
      return field.optional === true ? col : col.notNull();
    }
    case 'text': {
      const col = mysqlText(name);
      return field.optional === true ? col : col.notNull();
    }
    case 'slug': {
      const length = field.max ?? SLUG_DEFAULT_LENGTH;
      let col = mysqlVarchar(name, { length });
      if (field.unique !== false) col = col.unique() as typeof col;
      return field.optional === true ? col : col.notNull();
    }
    case 'number': {
      const col = field.integer === true ? mysqlInt(name) : mysqlDouble(name);
      return field.optional === true ? col : col.notNull();
    }
    case 'boolean': {
      let col = mysqlBoolean(name);
      if (field.default !== undefined) {
        col = col.default(field.default) as typeof col;
      }
      return field.optional === true ? col : col.notNull();
    }
    case 'reference': {
      // Хранение id целевого документа. Без БД-FK; целостность поддерживает
      // приложение (см. ADR 0001).
      const col = mysqlBigint(name, { mode: 'number', unsigned: true });
      return field.optional === true ? col : col.notNull();
    }
    case 'object':
    case 'array':
    case 'union':
    case 'richText':
    case 'image': {
      // JSON-колонка. richText — ProseMirror JSON; object/array/union — см. ADR 0001;
      // image — `{ assetId, alt? }`, ссылка на `media_assets`.
      const col = mysqlJson(name);
      return field.optional === true ? col : col.notNull();
    }
  }
}

// biome-ignore lint/suspicious/noExplicitAny: см. комментарий в mysqlColumnFor.
function postgresColumnFor(name: string, field: FieldDefinition): any {
  switch (field.type) {
    case 'string': {
      const length = field.max ?? DEFAULT_VARCHAR_LENGTH;
      const col = pgVarchar(name, { length });
      return field.optional === true ? col : col.notNull();
    }
    case 'text': {
      const col = pgText(name);
      return field.optional === true ? col : col.notNull();
    }
    case 'slug': {
      const length = field.max ?? SLUG_DEFAULT_LENGTH;
      let col = pgVarchar(name, { length });
      if (field.unique !== false) col = col.unique() as typeof col;
      return field.optional === true ? col : col.notNull();
    }
    case 'number': {
      const col = field.integer === true ? pgInteger(name) : pgDoublePrecision(name);
      return field.optional === true ? col : col.notNull();
    }
    case 'boolean': {
      let col = pgBoolean(name);
      if (field.default !== undefined) {
        col = col.default(field.default) as typeof col;
      }
      return field.optional === true ? col : col.notNull();
    }
    case 'reference': {
      // Хранение id целевого документа. Без БД-FK; целостность поддерживает
      // приложение (см. ADR 0001).
      const col = pgBigint(name, { mode: 'number' });
      return field.optional === true ? col : col.notNull();
    }
    case 'object':
    case 'array':
    case 'union':
    case 'richText':
    case 'image': {
      // jsonb — индексируемый JSON в PostgreSQL. См. ADR 0001 (object/array/union),
      // Phase 12 «Rich Text» (ProseMirror), Phase 13 «Медиа» (image — ссылка на ассет).
      const col = pgJsonb(name);
      return field.optional === true ? col : col.notNull();
    }
  }
}
