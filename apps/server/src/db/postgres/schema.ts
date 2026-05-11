import { sql } from 'drizzle-orm';
import { bigint, bigserial, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Аккаунт пользователя Studio. PostgreSQL-вариант таблицы `users` —
 * структура зеркальна MySQL, типы — нативные для Postgres.
 */
export const users = pgTable('users', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 32 }).notNull().default('admin'),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const sessions = pgTable('sessions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: bigint('user_id', { mode: 'number' })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const systemState = pgTable('system_state', {
  key: varchar('key', { length: 64 }).primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

/**
 * PostgreSQL-аналог `media_assets`. Зеркальная структура — отличия только
 * в нативных типах (bigserial/timestamp with timezone).
 */
export const mediaAssets = pgTable('media_assets', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  storageKey: varchar('storage_key', { length: 512 }).notNull().unique(),
  originalFilename: varchar('original_filename', { length: 512 }).notNull(),
  mimeType: varchar('mime_type', { length: 128 }).notNull(),
  size: bigint('size', { mode: 'number' }).notNull(),
  width: integer('width'),
  height: integer('height'),
  sha1: varchar('sha1', { length: 40 }).notNull(),
  alt: text('alt'),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
    .notNull()
    .default(sql`now()`),
  // Soft delete: см. JSDoc в MySQL-варианте.
  deletedAt: timestamp('deleted_at', { mode: 'date', withTimezone: true }),
});

export const postgresSystemSchema = { users, sessions, systemState, mediaAssets };
export type PostgresSystemSchema = typeof postgresSystemSchema;
