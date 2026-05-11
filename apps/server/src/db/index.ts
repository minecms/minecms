import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { drizzle as drizzleMysql, type MySql2Database } from 'drizzle-orm/mysql2';
import { migrate as migrateMysql } from 'drizzle-orm/mysql2/migrator';
import { drizzle as drizzlePostgres, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate as migratePostgres } from 'drizzle-orm/node-postgres/migrator';
import mysql from 'mysql2/promise';
import pg from 'pg';
import type { DatabaseDriver } from '../config';
import { type MysqlSystemSchema, mysqlSystemSchema } from './mysql/schema';
import { type PostgresSystemSchema, postgresSystemSchema } from './postgres/schema';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsRoot = resolve(here, '..', '..', 'migrations');

/**
 * Унифицированная обёртка над двумя диалектами Drizzle. Через `kind`
 * вызывающий код узнаёт, какой конкретный экземпляр БД у него на руках.
 */
export type MineDb =
  | {
      kind: 'mysql';
      driver: 'mysql';
      db: MySql2Database<MysqlSystemSchema>;
      schema: MysqlSystemSchema;
      close: () => Promise<void>;
      runMigrations: () => Promise<void>;
    }
  | {
      kind: 'postgres';
      driver: 'postgres';
      db: NodePgDatabase<PostgresSystemSchema>;
      schema: PostgresSystemSchema;
      close: () => Promise<void>;
      runMigrations: () => Promise<void>;
    };

export interface CreateDbOptions {
  driver: DatabaseDriver;
  url: string;
}

/**
 * Открывает пул соединений и оборачивает его в Drizzle. Не выполняет миграции
 * автоматически — этим занимается install.run или CLI.
 */
export async function createDb(options: CreateDbOptions): Promise<MineDb> {
  if (options.driver === 'mysql') {
    const pool = mysql.createPool({
      uri: options.url,
      waitForConnections: true,
      connectionLimit: 10,
      enableKeepAlive: true,
    });
    const db = drizzleMysql(pool, { schema: mysqlSystemSchema, mode: 'default' });
    return {
      kind: 'mysql',
      driver: 'mysql',
      db,
      schema: mysqlSystemSchema,
      close: async () => {
        await pool.end();
      },
      runMigrations: async () => {
        await migrateMysql(db, { migrationsFolder: resolve(migrationsRoot, 'mysql') });
      },
    };
  }

  const pool = new pg.Pool({ connectionString: options.url, max: 10 });
  const db = drizzlePostgres(pool, { schema: postgresSystemSchema });
  return {
    kind: 'postgres',
    driver: 'postgres',
    db,
    schema: postgresSystemSchema,
    close: async () => {
      await pool.end();
    },
    runMigrations: async () => {
      await migratePostgres(db, { migrationsFolder: resolve(migrationsRoot, 'postgres') });
    },
  };
}

/**
 * Лёгкая ping-проверка строки подключения. Используется install.testDatabase —
 * открывает временное соединение, выполняет SELECT 1, закрывает.
 */
export async function pingDatabase(options: CreateDbOptions): Promise<void> {
  if (options.driver === 'mysql') {
    const conn = await mysql.createConnection(options.url);
    try {
      await conn.query('SELECT 1');
    } finally {
      await conn.end();
    }
    return;
  }
  const client = new pg.Client({ connectionString: options.url });
  await client.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    await client.end();
  }
}

/**
 * Универсальный helper «подними соединение, прокатай таблицу system_state — вытащи installation_state».
 * Если таблицы ещё нет — возвращает 'pristine' (чистая БД, миграции не применялись).
 */
export async function readInstallationStateFromDb(db: MineDb): Promise<'pristine' | 'installed'> {
  if (db.kind === 'mysql') {
    const exists = await db.db.execute(sql`SHOW TABLES LIKE 'system_state'`);
    const rows = (exists as unknown as [Array<unknown>, unknown])[0];
    if (!Array.isArray(rows) || rows.length === 0) return 'pristine';

    const stateRows = await db.db
      .select()
      .from(db.schema.systemState)
      .where(sql`${db.schema.systemState.key} = 'installation_state'`);
    const first = stateRows[0];
    return first?.value === 'installed' ? 'installed' : 'pristine';
  }

  const exists = await db.db.execute(
    sql`SELECT 1 FROM information_schema.tables WHERE table_name = 'system_state' LIMIT 1`,
  );
  const rows = (exists as unknown as { rows?: unknown[] }).rows ?? [];
  if (rows.length === 0) return 'pristine';

  const stateRows = await db.db
    .select()
    .from(db.schema.systemState)
    .where(sql`${db.schema.systemState.key} = 'installation_state'`);
  const first = stateRows[0];
  return first?.value === 'installed' ? 'installed' : 'pristine';
}
