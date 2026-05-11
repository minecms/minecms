import { defineField, defineSchema } from '@minecms/core';
import { getTableConfig as getMysqlTableConfig, type MySqlTable } from 'drizzle-orm/mysql-core';
import { getTableConfig as getPgTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { buildMysqlUserTables, buildPostgresUserTables } from './tables';

function mustGetMysql(map: Record<string, MySqlTable>, key: string): MySqlTable {
  const v = map[key];
  if (!v) throw new Error(`Не найдена mysql-таблица ${key}`);
  return v;
}

function mustGetPg(map: Record<string, PgTable>, key: string): PgTable {
  const v = map[key];
  if (!v) throw new Error(`Не найдена pg-таблица ${key}`);
  return v;
}

const page = defineSchema({
  name: 'page',
  fields: {
    title: defineField.string({ label: 'Title', max: 200 }),
    body: defineField.text({ label: 'Body', optional: true }),
    slug: defineField.slug({ label: 'Slug', source: 'title' }),
    views: defineField.number({ label: 'Views', integer: true }),
    published: defineField.boolean({ label: 'Published', default: false }),
  },
  routeField: 'slug',
});

const post = defineSchema({
  name: 'blog-post',
  fields: {
    title: defineField.string({ label: 'Title' }),
  },
  timestamps: false,
});

describe('buildMysqlUserTables', () => {
  it('строит таблицы для каждой схемы', () => {
    const tables = buildMysqlUserTables([page, post]);
    expect(Object.keys(tables.bySchemaName)).toEqual(['page', 'blog-post']);
    expect(Object.keys(tables.byTableName)).toEqual(['page', 'blog_post']);
  });

  it('создаёт колонки id, поля схемы и timestamps + deleted_at', () => {
    const tables = buildMysqlUserTables([page]);
    const config = getMysqlTableConfig(mustGetMysql(tables.bySchemaName, 'page'));
    const names = config.columns.map((c) => c.name).sort();
    expect(names).toEqual([
      'body',
      'created_at',
      'deleted_at',
      'id',
      'published',
      'slug',
      'title',
      'updated_at',
      'views',
    ]);

    const titleCol = config.columns.find((c) => c.name === 'title');
    expect(titleCol?.notNull).toBe(true);

    const bodyCol = config.columns.find((c) => c.name === 'body');
    expect(bodyCol?.notNull).toBe(false);

    const deletedCol = config.columns.find((c) => c.name === 'deleted_at');
    expect(deletedCol?.notNull).toBe(false);
  });

  it('пропускает обычные timestamps, но deleted_at всегда добавляется', () => {
    const tables = buildMysqlUserTables([post]);
    const config = getMysqlTableConfig(mustGetMysql(tables.byTableName, 'blog_post'));
    const names = config.columns.map((c) => c.name).sort();
    expect(names).toEqual(['deleted_at', 'id', 'title']);
  });
});

describe('buildPostgresUserTables', () => {
  it('строит таблицы и зеркально содержит те же колонки, что и mysql', () => {
    const tables = buildPostgresUserTables([page]);
    const config = getPgTableConfig(mustGetPg(tables.bySchemaName, 'page'));
    const names = config.columns.map((c) => c.name).sort();
    expect(names).toEqual([
      'body',
      'created_at',
      'deleted_at',
      'id',
      'published',
      'slug',
      'title',
      'updated_at',
      'views',
    ]);
  });

  it('помечает slug как unique по умолчанию', () => {
    const tables = buildPostgresUserTables([page]);
    const config = getPgTableConfig(mustGetPg(tables.bySchemaName, 'page'));
    const slugCol = config.columns.find((c) => c.name === 'slug');
    expect(slugCol?.isUnique).toBe(true);
  });
});

const menu = defineSchema({
  name: 'menu',
  singleton: true,
  fields: {
    items: defineField.array({
      label: 'Items',
      of: defineField.union({
        label: 'Item',
        variants: {
          link: defineField.object({
            label: 'Link',
            fields: { url: defineField.string({ label: 'URL' }) },
          }),
          page: defineField.object({
            label: 'Page',
            fields: { ref: defineField.reference({ label: 'Page', to: ['pages'] }) },
          }),
        },
      }),
    }),
    author: defineField.reference({ label: 'Автор', to: ['users'], optional: true }),
  },
});

describe('Phase 11: nested поля → колонки БД', () => {
  it('mysql: array маппится в JSON, reference в bigint', () => {
    const tables = buildMysqlUserTables([menu]);
    const config = getMysqlTableConfig(mustGetMysql(tables.bySchemaName, 'menu'));
    const items = config.columns.find((c) => c.name === 'items');
    const author = config.columns.find((c) => c.name === 'author');
    expect(items?.columnType).toBe('MySqlJson');
    expect(items?.notNull).toBe(true);
    expect(author?.columnType).toBe('MySqlBigInt53');
    expect(author?.notNull).toBe(false);
  });

  it('postgres: array маппится в jsonb, reference в bigint', () => {
    const tables = buildPostgresUserTables([menu]);
    const config = getPgTableConfig(mustGetPg(tables.bySchemaName, 'menu'));
    const items = config.columns.find((c) => c.name === 'items');
    const author = config.columns.find((c) => c.name === 'author');
    expect(items?.columnType).toBe('PgJsonb');
    expect(items?.notNull).toBe(true);
    expect(author?.columnType).toBe('PgBigInt53');
    expect(author?.notNull).toBe(false);
  });
});

const article = defineSchema({
  name: 'article',
  fields: {
    title: defineField.string({ label: 'Title' }),
    body: defineField.richText({ label: 'Body', optional: true }),
  },
});

describe('Phase 12: richText → JSON-колонка', () => {
  it('mysql: richText → MySqlJson, optional ⇒ nullable', () => {
    const tables = buildMysqlUserTables([article]);
    const config = getMysqlTableConfig(mustGetMysql(tables.bySchemaName, 'article'));
    const body = config.columns.find((c) => c.name === 'body');
    expect(body?.columnType).toBe('MySqlJson');
    expect(body?.notNull).toBe(false);
  });

  it('postgres: richText → PgJsonb', () => {
    const tables = buildPostgresUserTables([article]);
    const config = getPgTableConfig(mustGetPg(tables.bySchemaName, 'article'));
    const body = config.columns.find((c) => c.name === 'body');
    expect(body?.columnType).toBe('PgJsonb');
    expect(body?.notNull).toBe(false);
  });
});
