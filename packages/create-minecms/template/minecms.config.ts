import { defineConfig, defineField, defineSchema } from '@minecms/core';

/**
 * Конфиг MineCMS — единственный источник правды для структуры контента.
 *
 * Драйвер и URL БД берутся из `.env` (DATABASE_DRIVER, DATABASE_URL).
 * SESSION_SECRET — тоже там. См. `.env.example` рядом.
 *
 * Запуск:
 *   docker compose up -d
 *   pnpm dev
 *   open http://localhost:3001/admin
 */

const pages = defineSchema({
  name: 'pages',
  pluralName: 'pages',
  label: 'Страницы',
  routeField: 'slug',
  timestamps: true,
  fields: {
    title: defineField.string({ label: 'Заголовок', max: 160 }),
    slug: defineField.slug({
      label: 'URL-сегмент',
      source: 'title',
      unique: true,
      description: 'Публичный URL: /<slug>.',
    }),
    description: defineField.text({ label: 'Описание', optional: true, max: 1000 }),
    cover: defineField.image({
      label: 'Обложка',
      optional: true,
      accept: ['image/png', 'image/jpeg', 'image/webp'],
    }),
    body: defineField.richText({ label: 'Содержимое', optional: true }),
    published: defineField.boolean({ label: 'Опубликовано', default: false }),
  },
});

const posts = defineSchema({
  name: 'posts',
  pluralName: 'posts',
  label: 'Записи блога',
  routeField: 'slug',
  timestamps: true,
  fields: {
    title: defineField.string({ label: 'Заголовок', max: 160 }),
    slug: defineField.slug({ label: 'URL', source: 'title', unique: true }),
    excerpt: defineField.text({ label: 'Анонс', optional: true, max: 280 }),
    cover: defineField.image({ label: 'Обложка', optional: true }),
    body: defineField.richText({ label: 'Содержимое', optional: true }),
    publishedAt: defineField.string({ label: 'Дата публикации', optional: true }),
  },
});

export default defineConfig({
  database: {
    driver: 'postgres',
  },
  schemas: [pages, posts],
  server: {
    port: 3001,
    cors: ['http://localhost:3000'],
  },
});
