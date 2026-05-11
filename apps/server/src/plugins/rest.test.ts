import { defineField, defineSchema } from '@minecms/core';
import { describe, expect, it } from 'vitest';
import { buildMysqlUserTables, buildPostgresUserTables } from '../schemas';
import { buildPublishedFilter } from './rest';

describe('REST · buildPublishedFilter', () => {
  it('возвращает SQL для схем с булевым полем `published`', () => {
    const pages = defineSchema({
      name: 'pages',
      routeField: 'slug',
      fields: {
        title: defineField.string({ label: 'Title' }),
        slug: defineField.slug({ label: 'Slug' }),
        published: defineField.boolean({ label: 'Published', default: false }),
      },
    });
    const mysql = buildMysqlUserTables([pages]);
    const pg = buildPostgresUserTables([pages]);

    expect(buildPublishedFilter(pages, mysql.bySchemaName.pages)).not.toBeNull();
    expect(buildPublishedFilter(pages, pg.bySchemaName.pages)).not.toBeNull();
  });

  it('возвращает null для схем без поля `published` (singleton-`home`)', () => {
    const home = defineSchema({
      name: 'home',
      singleton: true,
      fields: {
        title: defineField.string({ label: 'Title' }),
        body: defineField.richText({ label: 'Body', optional: true }),
      },
    });
    const mysql = buildMysqlUserTables([home]);
    expect(buildPublishedFilter(home, mysql.bySchemaName.home)).toBeNull();
  });

  it('возвращает null, если `published` объявлено как string/number (не boolean)', () => {
    const oddly = defineSchema({
      name: 'oddly',
      routeField: 'slug',
      fields: {
        slug: defineField.slug({ label: 'Slug' }),
        // строковое поле с зарезервированным именем не должно включать фильтр.
        published: defineField.string({ label: 'Published?' }),
      },
    });
    const mysql = buildMysqlUserTables([oddly]);
    expect(buildPublishedFilter(oddly, mysql.bySchemaName.oddly)).toBeNull();
  });
});
