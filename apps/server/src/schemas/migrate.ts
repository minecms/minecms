import type { SchemaDefinition } from '@minecms/core';
import {
  generateDrizzleJson,
  generateMigration,
  generateMySQLDrizzleJson,
  generateMySQLMigration,
  pushMySQLSchema,
  pushSchema,
} from 'drizzle-kit/api';
import { sql } from 'drizzle-orm';
import { getTableConfig as getMysqlTableConfig, type MySqlTable } from 'drizzle-orm/mysql-core';
import { getTableConfig as getPgTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import type { MineDb } from '../db';
import { mysqlSystemSchema } from '../db/mysql/schema';
import { postgresSystemSchema } from '../db/postgres/schema';
import { schemaToTableName } from './reserved';
import { buildMysqlUserTables, buildPostgresUserTables } from './tables';

/**
 * Результат пуша пользовательских схем в реальную БД.
 *
 * `applied` — что фактически выполнено (массив SQL-стейтментов).
 * `skipped` — почему ничего не применили (например, hasDataLoss + блокировка).
 */
export interface ApplyResult {
  applied: string[];
  warnings: string[];
  hasDataLoss: boolean;
  /** Если миграция отклонена — заполнено сообщением с причиной. */
  skippedReason: string | null;
}

export interface ApplyUserSchemasOptions {
  /** Связка с активной БД (mysql или postgres). */
  db: MineDb;
  /** Пользовательские схемы из `minecms.config.ts`. */
  schemas: SchemaDefinition[];
  /**
   * Имя БД для MySQL — нужен `pushMySQLSchema` и для проверки существующих таблиц.
   * Извлекается из `DATABASE_URL` через `URL.pathname`.
   */
  databaseName: string;
  /**
   * Если `true`, разрешить применение даже когда drizzle-kit считает миграцию
   * потенциально разрушительной (DROP/RENAME колонок). По умолчанию — `false`,
   * и сервер просто оставит схему как есть.
   */
  allowDataLoss?: boolean;
  /**
   * Не вызывать drizzle-kit push — только legacy RENAME (`page`→`pages`) и
   * `CREATE TABLE IF NOT EXISTS` для таблиц, которых нет в `public` / MySQL-БД.
   */
  skipPush?: boolean;
}

/**
 * Применяет пользовательские схемы к активному соединению.
 *
 * Стратегия (Postgres — схема `public`, как у Drizzle по умолчанию):
 * 0. Список таблиц через `information_schema`, плюс нормализация ответа `execute`.
 * 1. **Сначала** legacy RENAME (`page` → `pages`), чтобы не потерять строки перед push.
 * 2. Затем `pushMySQLSchema` / `pushSchema` — полный дифф.
 * 3. Если push вернул `0` стейтментов, но в схемах есть таблицы, которых
 *    физически нет в БД — добиваем CREATE'ы вручную через
 *    `generateMySQLMigration(empty, cur)` и фильтр по отсутствующим таблицам.
 *    Это страхует от багов push-режима в текущей версии drizzle-kit, при
 *    которых initial CREATE для новых пользовательских таблиц иногда теряется.
 * 3. Если в БД всё ещё нет ожидаемой таблицы — `CREATE TABLE IF NOT EXISTS` из
 *    сгенерированной миграции (в т.ч. когда деструктивный push отклонён).
 *
 * Пункт 1 — тот же сценарий «единственное число»: имя таблицы без финального `s`
 * и длина ≥ 5 (`page` → `pages`), без потери строк.
 *
 * ALTER колонок — через push (шаг 2); недостающие целые таблицы — шаг 3.
 */
export async function applyUserSchemas(options: ApplyUserSchemasOptions): Promise<ApplyResult> {
  const { db, schemas, databaseName, allowDataLoss, skipPush } = options;

  if (db.kind === 'mysql') {
    const userTables = buildMysqlUserTables(schemas);
    const imports = { ...mysqlSystemSchema, ...userTables.byTableName };

    const applied: string[] = [];
    const warnings: string[] = [];
    let skippedReason: string | null = null;
    let hasDataLoss = false;

    applied.push(...(await renameLegacySingularUserTablesMysql(db, databaseName, schemas)));
    // До push: выравниваем имена/наличие unique-индексов для slug-полей. Иначе
    // drizzle-kit на непустой таблице задаёт интерактивный prompt про truncate.
    applied.push(...(await alignSlugUniquesMysql(db, databaseName, schemas)));

    if (skipPush !== true) {
      // pushMySQLSchema может выкинуть исключение (например, в non-TTY окружении
      // на «interactive prompt» внутри drizzle-kit) — тогда продолжаем с safety net.
      try {
        const result = await pushMySQLSchema(imports, db.db, databaseName);
        warnings.push(...result.warnings);
        hasDataLoss = result.hasDataLoss;

        if (result.hasDataLoss && allowDataLoss !== true) {
          const partial = await applySafeSubset({
            db,
            statements: result.statementsToExecute,
          });
          applied.push(...partial.applied);
          warnings.push(...partial.skipped);
          if (partial.skipped.length > 0) {
            skippedReason = `Пропущены ${partial.skipped.length} деструктивных стейтментов миграции. Применены только безопасные. Запусти сервер с MINECMS_ALLOW_DATA_LOSS=true для полного применения.`;
          }
        } else if (result.statementsToExecute.length > 0) {
          await result.apply();
          applied.push(...result.statementsToExecute);
        }
      } catch (err) {
        warnings.push(
          `pushMySQLSchema упал: ${(err as Error).message ?? String(err)}. Применяем safety-net (CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS).`,
        );
        skippedReason =
          'drizzle-kit отклонил миграцию (вероятно, требует подтверждения в интерактивном режиме). Применены только безопасные изменения. Запусти сервер с MINECMS_ALLOW_DATA_LOSS=true для полного применения.';
      }
    }

    applied.push(...(await ensureMissingMysqlTables({ db, databaseName, schemas, imports })));
    applied.push(...(await ensureMissingMysqlColumns({ db, databaseName, schemas, userTables })));
    applied.push(...(await ensureMissingMysqlSystemColumns(db, databaseName)));

    return { applied, warnings, hasDataLoss, skippedReason };
  }

  const userTables = buildPostgresUserTables(schemas);
  const imports = { ...postgresSystemSchema, ...userTables.byTableName };

  const applied: string[] = [];
  const warnings: string[] = [];
  let skippedReason: string | null = null;
  let hasDataLoss = false;

  // RENAME до push: иначе drizzle может предложить CREATE пустой `pages`, пока данные в `page`.
  applied.push(...(await renameLegacySingularUserTablesPostgres(db, schemas)));
  // И до push: выравниваем slug-unique constraints. Иначе drizzle-kit на таблице
  // с данными запросит интерактивный truncate → upgrade падает в non-TTY.
  applied.push(...(await alignSlugUniquesPostgres(db, schemas)));

  if (skipPush !== true) {
    try {
      // pushSchema хочет PgDatabase<any> — у нас NodePgDatabase, который структурно
      // совместим, но из-за `exactOptionalPropertyTypes` и обобщений нужен каст.
      const result = await pushSchema(
        imports,
        db.db as unknown as Parameters<typeof pushSchema>[1],
      );
      warnings.push(...result.warnings);
      hasDataLoss = result.hasDataLoss;

      if (result.hasDataLoss && allowDataLoss !== true) {
        const partial = await applySafeSubset({
          db,
          statements: result.statementsToExecute,
        });
        applied.push(...partial.applied);
        warnings.push(...partial.skipped);
        if (partial.skipped.length > 0) {
          skippedReason = `Пропущены ${partial.skipped.length} деструктивных стейтментов миграции. Применены только безопасные. Запусти сервер с MINECMS_ALLOW_DATA_LOSS=true для полного применения.`;
        }
      } else if (result.statementsToExecute.length > 0) {
        await result.apply();
        applied.push(...result.statementsToExecute);
      }
    } catch (err) {
      warnings.push(
        `pushSchema упал: ${(err as Error).message ?? String(err)}. Применяем safety-net (CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS).`,
      );
      skippedReason =
        'drizzle-kit отклонил миграцию (вероятно, требует подтверждения в интерактивном режиме). Применены только безопасные изменения. Запусти сервер с MINECMS_ALLOW_DATA_LOSS=true для полного применения.';
    }
  }

  applied.push(...(await ensureMissingPostgresTables({ db, schemas, imports })));
  applied.push(...(await ensureMissingPostgresColumns({ db, schemas, userTables })));
  applied.push(...(await ensureMissingPostgresSystemColumns(db)));

  return { applied, warnings, hasDataLoss, skippedReason };
}

/**
 * Когда drizzle-kit пометил всю миграцию как `hasDataLoss`, многие стейтменты
 * внутри пакета по факту безопасны (например, `ALTER TABLE … ADD COLUMN … jsonb` —
 * добавление nullable-колонки). Эта функция выполняет поштучно только заведомо
 * безопасные стейтменты, остальные возвращает как «пропущенные» — чтобы вызывающий
 * сложил их в warnings.
 *
 * Безопасные паттерны (для обоих диалектов):
 * - `CREATE TABLE …` — новая таблица, ничего не теряет.
 * - `CREATE (UNIQUE )?INDEX …` — индекс. Уникальный может упасть на дублях, но это
 *   не data loss; ловится на уровне БД и попадает в логи как обычная ошибка.
 * - `ALTER TABLE … ADD COLUMN …` — только если стейтмент не содержит `NOT NULL`
 *   без `DEFAULT` (иначе на непустой таблице упадёт).
 *
 * Опасные (всегда пропускаем): `DROP …`, `ALTER COLUMN … TYPE`, `DROP COLUMN`,
 * `RENAME COLUMN`, `ADD CONSTRAINT … UNIQUE`, `ADD CONSTRAINT … PRIMARY KEY`,
 * `ALTER COLUMN … SET NOT NULL` без default.
 */
interface ApplySafeOptions {
  db: MineDb;
  statements: readonly string[];
}

interface ApplySafeResult {
  applied: string[];
  skipped: string[];
}

async function applySafeSubset(options: ApplySafeOptions): Promise<ApplySafeResult> {
  const { db, statements } = options;
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const stmt of statements) {
    if (isSafeStatement(stmt)) {
      try {
        // db.kind разводит mysql/pg типы Drizzle. execute идентичен по семантике —
        // явное ветвление нужно только чтобы TS подобрал нужную сигнатуру.
        if (db.kind === 'mysql') {
          await db.db.execute(sql.raw(stmt));
        } else {
          await db.db.execute(sql.raw(stmt));
        }
        applied.push(stmt);
      } catch (err) {
        // Безопасный по форме стейтмент может упасть из-за реальных дублей (UNIQUE)
        // или несовместимости типа. Не валим миграцию целиком — просто отмечаем.
        skipped.push(`(failed) ${stmt} :: ${(err as Error).message}`);
      }
    } else {
      skipped.push(stmt);
    }
  }

  return { applied, skipped };
}

/**
 * Эвристика «безопасности» SQL-стейтмента — экспортирована для unit-тестов
 * безопасных/опасных классов. Семантику см. в JSDoc {@link applySafeSubset}.
 */
export function isSafeStatement(stmt: string): boolean {
  const trimmed = stmt.trim().replace(/;\s*$/, '');
  const upper = trimmed.toUpperCase();

  // Безусловно опасные паттерны.
  if (
    /^DROP\s+/i.test(trimmed) ||
    /\bDROP\s+(COLUMN|CONSTRAINT|INDEX|TABLE)\b/i.test(trimmed) ||
    /\bALTER\s+COLUMN\b.*\bTYPE\b/i.test(trimmed) ||
    /\bALTER\s+COLUMN\b.*\bSET\s+NOT\s+NULL\b/i.test(trimmed) ||
    /\bRENAME\s+COLUMN\b/i.test(trimmed) ||
    /\bRENAME\s+CONSTRAINT\b/i.test(trimmed) ||
    /\bRENAME\s+INDEX\b/i.test(trimmed) ||
    /\bADD\s+CONSTRAINT\b.*\b(UNIQUE|PRIMARY\s+KEY)\b/i.test(trimmed)
  ) {
    return false;
  }

  if (upper.startsWith('CREATE TABLE')) return true;
  if (upper.startsWith('CREATE INDEX')) return true;
  if (upper.startsWith('CREATE UNIQUE INDEX')) return true;

  if (/^ALTER\s+TABLE\b/i.test(trimmed) && /\bADD\s+COLUMN\b/i.test(trimmed)) {
    // ADD COLUMN с NOT NULL без default не безопасен на непустой таблице.
    const hasNotNull = /\bNOT\s+NULL\b/i.test(trimmed);
    const hasDefault = /\bDEFAULT\b/i.test(trimmed);
    return !hasNotNull || hasDefault;
  }

  return false;
}

/**
 * Достаёт имя БД из строки подключения. Для `mysql://user:pass@host:port/db?...`
 * берёт path без ведущего `/`. Бросает ошибку, если БД не указана —
 * `pushMySQLSchema` без неё работать не будет.
 */
export function databaseNameFromUrl(driver: 'mysql' | 'postgres', url: string): string {
  const parsed = new URL(url);
  const dbName = parsed.pathname.replace(/^\//, '').split('?')[0] ?? '';
  if (!dbName) {
    throw new Error(
      `В ${driver}-URL не указано имя базы данных: ${url}. Ожидается формат ${driver}://user:pass@host:port/dbname.`,
    );
  }
  return dbName;
}

/**
 * Drizzle + node-postgres: `execute` может вернуть `{ rows }` или (в отдельных
 * режимах) массив строк — без нормализации список таблиц оказывается пустым и
 * миграции на Postgres молча не срабатывают.
 */
function pgExecuteRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) {
    return result as Array<Record<string, unknown>>;
  }
  if (result !== null && typeof result === 'object' && 'rows' in result) {
    const rows = (result as { rows: unknown }).rows;
    if (Array.isArray(rows)) {
      return rows as Array<Record<string, unknown>>;
    }
  }
  return [];
}

/** Имена пользовательских таблиц в `public` (как у Drizzle по умолчанию). */
async function listPostgresPublicBaseTables(
  db: Extract<MineDb, { kind: 'postgres' }>,
): Promise<Set<string>> {
  const raw = await db.db.execute(
    sql.raw(`
      SELECT table_name AS tbl
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `),
  );
  return new Set(pgExecuteRows(raw).map((r) => String(r.tbl)));
}

/** Не короче — иначе `news` превратится в кандидата `new`. */
const LEGACY_PLURAL_TABLE_MIN_LEN = 5;

/**
 * Если таблица под текущую схему отсутствует, но есть таблица с именем без
 * финального `s` (и длина имени ≥ {@link LEGACY_PLURAL_TABLE_MIN_LEN}),
 * переименовывает её — восстанавливает данные после `name: 'page'` → `'pages'`.
 */
async function renameLegacySingularUserTablesMysql(
  db: Extract<MineDb, { kind: 'mysql' }>,
  databaseName: string,
  schemas: SchemaDefinition[],
): Promise<string[]> {
  const rows = (await db.db.execute(
    sql.raw(
      `SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = '${databaseName}'`,
    ),
  )) as unknown as Array<Array<{ TABLE_NAME: string }>>;
  const existing = new Set((rows[0] ?? []).map((r) => r.TABLE_NAME));

  return applySingularToPluralRenames(existing, schemas, async (legacy, next) => {
    const stmt = `RENAME TABLE \`${legacy}\` TO \`${next}\``;
    await db.db.execute(sql.raw(stmt));
    return stmt;
  });
}

async function renameLegacySingularUserTablesPostgres(
  db: Extract<MineDb, { kind: 'postgres' }>,
  schemas: SchemaDefinition[],
): Promise<string[]> {
  const existing = await listPostgresPublicBaseTables(db);

  return applySingularToPluralRenames(existing, schemas, async (legacy, next) => {
    const stmt = `ALTER TABLE "public"."${legacy}" RENAME TO "${next}"`;
    await db.db.execute(sql.raw(stmt));
    return stmt;
  });
}

async function applySingularToPluralRenames(
  existing: Set<string>,
  schemas: SchemaDefinition[],
  rename: (legacy: string, next: string) => Promise<string>,
): Promise<string[]> {
  const applied: string[] = [];
  for (const s of schemas) {
    const next = schemaToTableName(s.name);
    if (existing.has(next)) continue;
    if (next.length < LEGACY_PLURAL_TABLE_MIN_LEN || !next.endsWith('s')) {
      continue;
    }
    const legacy = next.slice(0, -1);
    if (!existing.has(legacy)) continue;
    applied.push(await rename(legacy, next));
    existing.delete(legacy);
    existing.add(next);
  }
  return applied;
}

interface EnsureMysqlOptions {
  db: Extract<MineDb, { kind: 'mysql' }>;
  databaseName: string;
  schemas: SchemaDefinition[];
  imports: Record<string, unknown>;
}

/**
 * Подстраховка для MySQL: если push не создал часть таблиц (известный баг
 * drizzle-kit с initial CREATE), достраиваем `CREATE TABLE IF NOT EXISTS …`
 * для каждой пользовательской таблицы, которой нет в БД.
 */
async function ensureMissingMysqlTables(options: EnsureMysqlOptions): Promise<string[]> {
  const { db, databaseName, schemas, imports } = options;
  if (schemas.length === 0) return [];

  const rows = (await db.db.execute(
    sql.raw(
      `SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = '${databaseName}'`,
    ),
  )) as unknown as Array<Array<{ TABLE_NAME: string }>>;
  const existing = new Set((rows[0] ?? []).map((r) => r.TABLE_NAME));

  const tableNamesToEnsure = schemas
    .map((s) => schemaToTableName(s.name))
    .filter((name) => !existing.has(name));
  if (tableNamesToEnsure.length === 0) return [];

  const empty = await generateMySQLDrizzleJson({});
  const cur = await generateMySQLDrizzleJson(imports);
  const allStatements = await generateMySQLMigration(empty, cur);

  const applied: string[] = [];
  for (const stmt of allStatements) {
    const match = stmt.match(/^CREATE TABLE `([^`]+)`/);
    if (!match) continue;
    const name = match[1];
    if (!name) continue;
    if (!tableNamesToEnsure.includes(name)) continue;
    const idempotent = stmt.replace(/^CREATE TABLE `([^`]+)`/, 'CREATE TABLE IF NOT EXISTS `$1`');
    await db.db.execute(sql.raw(idempotent));
    applied.push(idempotent);
  }
  return applied;
}

interface EnsurePostgresOptions {
  db: Extract<MineDb, { kind: 'postgres' }>;
  schemas: SchemaDefinition[];
  imports: Record<string, unknown>;
}

/** Postgres-аналог `ensureMissingMysqlTables`. */
async function ensureMissingPostgresTables(options: EnsurePostgresOptions): Promise<string[]> {
  const { db, schemas, imports } = options;
  if (schemas.length === 0) return [];

  const existing = await listPostgresPublicBaseTables(db);

  const tableNamesToEnsure = schemas
    .map((s) => schemaToTableName(s.name))
    .filter((name) => !existing.has(name));
  if (tableNamesToEnsure.length === 0) return [];

  const empty = await generateDrizzleJson({});
  const cur = await generateDrizzleJson(imports);
  const allStatements = await generateMigration(empty, cur);

  const applied: string[] = [];
  for (const stmt of allStatements) {
    const name = extractPgCreateTableName(stmt);
    if (!name) continue;
    if (!tableNamesToEnsure.includes(name)) continue;
    const idempotent = stmt.trimStart().replace(/^CREATE TABLE\s+/, 'CREATE TABLE IF NOT EXISTS ');
    await db.db.execute(sql.raw(idempotent));
    applied.push(idempotent);
  }
  return applied;
}

/** Имя таблицы из первого `CREATE TABLE` в стейтменте (drizzle может добавить схему `public`). */
function extractPgCreateTableName(stmt: string): string | null {
  const m = stmt.trimStart().match(/^CREATE TABLE (?:"public"\.)?"([^"]+)"/);
  return m?.[1] ?? null;
}

interface EnsureMysqlColumnsOptions {
  db: Extract<MineDb, { kind: 'mysql' }>;
  databaseName: string;
  schemas: SchemaDefinition[];
  userTables: { bySchemaName: Record<string, MySqlTable> };
}

/**
 * Safety net на уровне колонок: если в БД нет колонки, которая есть в Drizzle-схеме,
 * — добавляет её через `ALTER TABLE … ADD COLUMN IF NOT EXISTS …`. Опасные изменения
 * (NOT NULL без default, изменение типа) не делает.
 *
 * Нужен потому, что drizzle-kit `pushMySQLSchema` иногда «обижается» на побочные
 * деструктивные изменения и роняет всю миграцию (вплоть до интерактивных запросов
 * на подтверждение в non-TTY окружении), а добавление nullable-колонки само по себе
 * безопасно и не должно блокироваться.
 */
async function ensureMissingMysqlColumns(options: EnsureMysqlColumnsOptions): Promise<string[]> {
  const { db, databaseName, schemas, userTables } = options;
  if (schemas.length === 0) return [];

  const applied: string[] = [];
  for (const schema of schemas) {
    const tableName = schemaToTableName(schema.name);
    const table = userTables.bySchemaName[schema.name];
    if (!table) continue;

    const existingColumns = await listMysqlTableColumns(db, databaseName, tableName);
    if (existingColumns.size === 0) continue; // таблицы ещё нет — её создаст ensureMissingMysqlTables

    const config = getMysqlTableConfig(table);
    for (const column of config.columns) {
      if (existingColumns.has(column.name)) continue;
      const sqlType = (column as { getSQLType(): string }).getSQLType();
      const isNullable = !(column as { notNull?: boolean }).notNull;
      const defaultRaw = (column as { default?: unknown }).default;
      const hasDefault = defaultRaw !== undefined && defaultRaw !== null;
      if (!isNullable && !hasDefault) continue; // опасно: NOT NULL без default

      const nullSuffix = isNullable ? '' : ' NOT NULL';
      // MySQL не поддерживает `ADD COLUMN IF NOT EXISTS` — идемпотентность достигается
      // pre-check'ом через information_schema выше.
      const stmt = `ALTER TABLE \`${tableName}\` ADD COLUMN \`${column.name}\` ${sqlType}${nullSuffix}`;
      try {
        await db.db.execute(sql.raw(stmt));
        applied.push(stmt);
      } catch (err) {
        applied.push(`(failed) ${stmt} :: ${(err as Error).message}`);
      }
    }
  }
  return applied;
}

interface EnsurePostgresColumnsOptions {
  db: Extract<MineDb, { kind: 'postgres' }>;
  schemas: SchemaDefinition[];
  userTables: { bySchemaName: Record<string, PgTable> };
}

/** Postgres-аналог {@link ensureMissingMysqlColumns}. */
async function ensureMissingPostgresColumns(
  options: EnsurePostgresColumnsOptions,
): Promise<string[]> {
  const { db, schemas, userTables } = options;
  if (schemas.length === 0) return [];

  const applied: string[] = [];
  for (const schema of schemas) {
    const tableName = schemaToTableName(schema.name);
    const table = userTables.bySchemaName[schema.name];
    if (!table) continue;

    const existingColumns = await listPostgresTableColumns(db, tableName);
    if (existingColumns.size === 0) continue; // таблица отсутствует — будет создана выше

    const config = getPgTableConfig(table);
    for (const column of config.columns) {
      if (existingColumns.has(column.name)) continue;
      const sqlType = (column as { getSQLType(): string }).getSQLType();
      const isNullable = !(column as { notNull?: boolean }).notNull;
      const defaultRaw = (column as { default?: unknown }).default;
      const hasDefault = defaultRaw !== undefined && defaultRaw !== null;
      if (!isNullable && !hasDefault) continue;

      const nullSuffix = isNullable ? '' : ' NOT NULL';
      const stmt = `ALTER TABLE "public"."${tableName}" ADD COLUMN IF NOT EXISTS "${column.name}" ${sqlType}${nullSuffix}`;
      try {
        await db.db.execute(sql.raw(stmt));
        applied.push(stmt);
      } catch (err) {
        applied.push(`(failed) ${stmt} :: ${(err as Error).message}`);
      }
    }
  }
  return applied;
}

/**
 * Имя slug-unique constraint, которого ожидает Drizzle для inline `.unique()`:
 * `<table>_<column>_unique`. Совпадает с генерацией `drizzle-kit` — поэтому
 * после выравнивания push не видит дельты и не запускает интерактивный prompt.
 */
export function slugUniqueName(tableName: string, columnName: string): string {
  return `${tableName}_${columnName}_unique`;
}

interface SlugUnique {
  table: string;
  column: string;
  constraintName: string;
}

/** Все slug-поля схем, на которых стоит ожидать unique-constraint. */
function collectSlugUniques(schemas: SchemaDefinition[]): SlugUnique[] {
  const out: SlugUnique[] = [];
  for (const schema of schemas) {
    const table = schemaToTableName(schema.name);
    for (const [key, field] of Object.entries(schema.fields)) {
      if (field.type !== 'slug') continue;
      if (field.unique === false) continue;
      out.push({ table, column: key, constraintName: slugUniqueName(table, key) });
    }
  }
  return out;
}

interface DbUniqueConstraint {
  name: string;
  columns: string[];
}

/**
 * Выравнивает unique-constraint'ы для slug-полей в Postgres до запуска `pushSchema`.
 *
 * Делает три вещи:
 * 1. Пропускает таблицы, которых ещё нет в БД — push сам создаст их с inline UNIQUE.
 * 2. Если на нужной колонке уже есть unique с правильным именем — ничего.
 * 3. Если есть unique на той же колонке с **другим** именем (например, после
 *    `ALTER TABLE page RENAME TO pages` constraint остался `page_slug_unique`) —
 *    переименовывает в ожидаемое `<table>_<col>_unique`, чтобы drizzle-kit
 *    увидел нулевую дельту и не задавал interactive prompt.
 * 4. Если unique нет — `ADD CONSTRAINT … UNIQUE (col)`. Если в данных дубли,
 *    стейтмент упадёт; ловим, кладём в applied как `(failed) …` и идём дальше.
 */
async function alignSlugUniquesPostgres(
  db: Extract<MineDb, { kind: 'postgres' }>,
  schemas: SchemaDefinition[],
): Promise<string[]> {
  const slugUniques = collectSlugUniques(schemas);
  if (slugUniques.length === 0) return [];

  const existing = await listPostgresPublicBaseTables(db);
  const applied: string[] = [];
  for (const { table, column, constraintName } of slugUniques) {
    if (!existing.has(table)) continue;

    const constraints = await listPostgresUniqueConstraints(db, table);
    if (constraints.some((c) => c.name === constraintName && sameSingleColumn(c, column))) continue;

    const renameSource = constraints.find((c) => sameSingleColumn(c, column));
    if (renameSource) {
      const stmt = `ALTER TABLE "public"."${table}" RENAME CONSTRAINT "${renameSource.name}" TO "${constraintName}"`;
      try {
        await db.db.execute(sql.raw(stmt));
        applied.push(stmt);
      } catch (err) {
        applied.push(`(failed) ${stmt} :: ${(err as Error).message}`);
      }
      continue;
    }

    const stmt = `ALTER TABLE "public"."${table}" ADD CONSTRAINT "${constraintName}" UNIQUE ("${column}")`;
    try {
      await db.db.execute(sql.raw(stmt));
      applied.push(stmt);
    } catch (err) {
      applied.push(`(failed) ${stmt} :: ${(err as Error).message}`);
    }
  }
  return applied;
}

/** MySQL-аналог {@link alignSlugUniquesPostgres}. Использует `RENAME INDEX` (MySQL ≥ 5.7). */
async function alignSlugUniquesMysql(
  db: Extract<MineDb, { kind: 'mysql' }>,
  databaseName: string,
  schemas: SchemaDefinition[],
): Promise<string[]> {
  const slugUniques = collectSlugUniques(schemas);
  if (slugUniques.length === 0) return [];

  const existing = await listMysqlBaseTables(db, databaseName);
  const applied: string[] = [];
  for (const { table, column, constraintName } of slugUniques) {
    if (!existing.has(table)) continue;

    const constraints = await listMysqlUniqueIndexes(db, databaseName, table);
    if (constraints.some((c) => c.name === constraintName && sameSingleColumn(c, column))) continue;

    const renameSource = constraints.find((c) => sameSingleColumn(c, column));
    if (renameSource) {
      const stmt = `ALTER TABLE \`${table}\` RENAME INDEX \`${renameSource.name}\` TO \`${constraintName}\``;
      try {
        await db.db.execute(sql.raw(stmt));
        applied.push(stmt);
      } catch (err) {
        applied.push(`(failed) ${stmt} :: ${(err as Error).message}`);
      }
      continue;
    }

    const stmt = `ALTER TABLE \`${table}\` ADD UNIQUE INDEX \`${constraintName}\` (\`${column}\`)`;
    try {
      await db.db.execute(sql.raw(stmt));
      applied.push(stmt);
    } catch (err) {
      applied.push(`(failed) ${stmt} :: ${(err as Error).message}`);
    }
  }
  return applied;
}

function sameSingleColumn(c: DbUniqueConstraint, column: string): boolean {
  return c.columns.length === 1 && c.columns[0] === column;
}

async function listPostgresUniqueConstraints(
  db: Extract<MineDb, { kind: 'postgres' }>,
  tableName: string,
): Promise<DbUniqueConstraint[]> {
  const raw = await db.db.execute(
    sql.raw(`
      SELECT tc.constraint_name AS name,
             array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS cols
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
       AND kcu.table_schema = tc.table_schema
       AND kcu.table_name = tc.table_name
      WHERE tc.table_schema = 'public'
        AND tc.table_name = '${tableName}'
        AND tc.constraint_type = 'UNIQUE'
      GROUP BY tc.constraint_name
    `),
  );
  return pgExecuteRows(raw).map((r) => ({
    name: String(r.name),
    columns: Array.isArray(r.cols) ? (r.cols as unknown[]).map(String) : [],
  }));
}

async function listMysqlBaseTables(
  db: Extract<MineDb, { kind: 'mysql' }>,
  databaseName: string,
): Promise<Set<string>> {
  const rows = (await db.db.execute(
    sql.raw(
      `SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = '${databaseName}'`,
    ),
  )) as unknown as Array<Array<{ TABLE_NAME: string }>>;
  return new Set((rows[0] ?? []).map((r) => r.TABLE_NAME));
}

async function listMysqlUniqueIndexes(
  db: Extract<MineDb, { kind: 'mysql' }>,
  databaseName: string,
  tableName: string,
): Promise<DbUniqueConstraint[]> {
  const rows = (await db.db.execute(
    sql.raw(`
      SELECT INDEX_NAME AS name,
             GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS cols
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = '${databaseName}'
        AND TABLE_NAME = '${tableName}'
        AND NON_UNIQUE = 0
        AND INDEX_NAME != 'PRIMARY'
      GROUP BY INDEX_NAME
    `),
  )) as unknown as Array<Array<{ name: string; cols: string }>>;
  return (rows[0] ?? []).map((r) => ({
    name: r.name,
    columns: r.cols ? r.cols.split(',') : [],
  }));
}

async function listMysqlTableColumns(
  db: Extract<MineDb, { kind: 'mysql' }>,
  databaseName: string,
  tableName: string,
): Promise<Set<string>> {
  const rows = (await db.db.execute(
    sql.raw(
      `SELECT COLUMN_NAME FROM information_schema.columns
       WHERE TABLE_SCHEMA = '${databaseName}' AND TABLE_NAME = '${tableName}'`,
    ),
  )) as unknown as Array<Array<{ COLUMN_NAME: string }>>;
  return new Set((rows[0] ?? []).map((r) => r.COLUMN_NAME));
}

async function listPostgresTableColumns(
  db: Extract<MineDb, { kind: 'postgres' }>,
  tableName: string,
): Promise<Set<string>> {
  const raw = await db.db.execute(
    sql.raw(`
      SELECT column_name AS col
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = '${tableName}'
    `),
  );
  return new Set(pgExecuteRows(raw).map((r) => String(r.col)));
}

/**
 * Safety net для **системных** таблиц (users, sessions, system_state,
 * media_assets). `pushSchema` обычно справляется, но если он сломался
 * по другой причине (например, hasDataLoss из-за пользовательской таблицы),
 * системные колонки рискуют не доехать. Здесь добавляем только безопасные
 * — nullable / с DEFAULT, не трогаем NOT NULL без default.
 */
async function ensureMissingMysqlSystemColumns(
  db: Extract<MineDb, { kind: 'mysql' }>,
  databaseName: string,
): Promise<string[]> {
  const applied: string[] = [];
  for (const [, table] of Object.entries(mysqlSystemSchema)) {
    const config = getMysqlTableConfig(table);
    const tableName = config.name;
    const existing = await listMysqlTableColumns(db, databaseName, tableName);
    if (existing.size === 0) continue; // системная таблица ещё не создана — push выше её создаст
    for (const column of config.columns) {
      if (existing.has(column.name)) continue;
      const sqlType = (column as { getSQLType(): string }).getSQLType();
      const isNullable = !(column as { notNull?: boolean }).notNull;
      const defaultRaw = (column as { default?: unknown }).default;
      const hasDefault = defaultRaw !== undefined && defaultRaw !== null;
      if (!isNullable && !hasDefault) continue;
      const nullSuffix = isNullable ? '' : ' NOT NULL';
      const stmt = `ALTER TABLE \`${tableName}\` ADD COLUMN \`${column.name}\` ${sqlType}${nullSuffix}`;
      try {
        await db.db.execute(sql.raw(stmt));
        applied.push(stmt);
      } catch (err) {
        applied.push(`(failed) ${stmt} :: ${(err as Error).message}`);
      }
    }
  }
  return applied;
}

/** Postgres-аналог {@link ensureMissingMysqlSystemColumns}. */
async function ensureMissingPostgresSystemColumns(
  db: Extract<MineDb, { kind: 'postgres' }>,
): Promise<string[]> {
  const applied: string[] = [];
  for (const [, table] of Object.entries(postgresSystemSchema)) {
    const config = getPgTableConfig(table);
    const tableName = config.name;
    const existing = await listPostgresTableColumns(db, tableName);
    if (existing.size === 0) continue;
    for (const column of config.columns) {
      if (existing.has(column.name)) continue;
      const sqlType = (column as { getSQLType(): string }).getSQLType();
      const isNullable = !(column as { notNull?: boolean }).notNull;
      const defaultRaw = (column as { default?: unknown }).default;
      const hasDefault = defaultRaw !== undefined && defaultRaw !== null;
      if (!isNullable && !hasDefault) continue;
      const nullSuffix = isNullable ? '' : ' NOT NULL';
      const stmt = `ALTER TABLE "public"."${tableName}" ADD COLUMN IF NOT EXISTS "${column.name}" ${sqlType}${nullSuffix}`;
      try {
        await db.db.execute(sql.raw(stmt));
        applied.push(stmt);
      } catch (err) {
        applied.push(`(failed) ${stmt} :: ${(err as Error).message}`);
      }
    }
  }
  return applied;
}
