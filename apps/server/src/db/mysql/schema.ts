import { sql } from 'drizzle-orm';
import { bigint, int, mysqlTable, text, timestamp, varchar } from 'drizzle-orm/mysql-core';

/**
 * Аккаунт пользователя Studio.
 * `password_hash` — argon2id-строка вида `$argon2id$v=19$m=...,t=...,p=...$salt$hash`.
 * `role` — на старте только 'admin'; расширение ролей появится в Phase 5.
 */
export const users = mysqlTable('users', {
  id: bigint('id', { mode: 'number', unsigned: true }).primaryKey().autoincrement(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 512 }).notNull(),
  role: varchar('role', { length: 32 }).notNull().default('admin'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
    .onUpdateNow(),
});

/**
 * Сессии — privileged ключ, хранящийся в подписанной cookie. Запись здесь нужна
 * только для серверной валидации и инвалидации (logout, ротация секрета).
 */
export const sessions = mysqlTable('sessions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: bigint('user_id', { mode: 'number', unsigned: true })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Singleton-таблица состояния установки и других служебных флагов.
 * Ключи: `installation_state` ('pristine'|'installed'), `installation_driver`,
 * `installed_at`, `schema_version`.
 */
export const systemState = mysqlTable('system_state', {
  key: varchar('key', { length: 64 }).primaryKey(),
  value: varchar('value', { length: 512 }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
    .onUpdateNow(),
});

/**
 * Метаданные загруженных медиа-файлов. Сами файлы лежат в S3-совместимом
 * хранилище под ключом `key`; здесь — описание для Studio (превью, размер,
 * исходное имя), плюс sha1 для дедупликации.
 *
 * `alt` хранится здесь как «глобальный» текст-замена; конкретные использования
 * в полях документа могут переопределять его в значении поля (`ImageValue.alt`).
 */
export const mediaAssets = mysqlTable('media_assets', {
  id: bigint('id', { mode: 'number', unsigned: true }).primaryKey().autoincrement(),
  storageKey: varchar('storage_key', { length: 512 }).notNull().unique(),
  originalFilename: varchar('original_filename', { length: 512 }).notNull(),
  mimeType: varchar('mime_type', { length: 128 }).notNull(),
  size: bigint('size', { mode: 'number', unsigned: true }).notNull(),
  width: int('width'),
  height: int('height'),
  sha1: varchar('sha1', { length: 40 }).notNull(),
  alt: text('alt'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
    .onUpdateNow(),
  // Soft delete: NULL → активный файл, timestamp → в корзине. При purge —
  // hard delete строки + удаление объекта из S3. Документы продолжают ссылаться
  // на asset.id; при выдаче expandImageFields отдаёт null для удалённых.
  deletedAt: timestamp('deleted_at', { mode: 'date' }),
});

export const mysqlSystemSchema = { users, sessions, systemState, mediaAssets };
export type MysqlSystemSchema = typeof mysqlSystemSchema;
