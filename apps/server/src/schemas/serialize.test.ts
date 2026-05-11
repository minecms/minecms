import { defineField, defineSchema } from '@minecms/core';
import { describe, expect, it } from 'vitest';
import { serializeSchema } from './serialize';

describe('serializeSchema', () => {
  it('переводит RegExp pattern в строку', () => {
    const schema = defineSchema({
      name: 'profile',
      fields: {
        username: defineField.string({
          label: 'Username',
          pattern: /^[a-z0-9]+$/,
          min: 3,
          max: 20,
        }),
      },
    });
    const out = serializeSchema(schema);
    const username = out.fields.username;
    if (username?.type !== 'string') throw new Error('expected string field');
    expect(username.pattern).toBe('^[a-z0-9]+$');
    expect(username.min).toBe(3);
    expect(username.max).toBe(20);
  });

  it('помечает поле optional, если задан optional: true', () => {
    const schema = defineSchema({
      name: 'note',
      fields: {
        body: defineField.text({ label: 'Body', optional: true }),
      },
    });
    const out = serializeSchema(schema);
    expect(out.fields.body?.optional).toBe(true);
  });

  it('расставляет дефолты pluralName / label / timestamps', () => {
    const schema = defineSchema({
      name: 'page',
      fields: { title: defineField.string({ label: 'Title' }) },
    });
    const out = serializeSchema(schema);
    expect(out.pluralName).toBe('pages');
    expect(out.label).toBe('page');
    expect(out.icon).toBeNull();
    expect(out.type).toBe('page');
    expect(out.singleton).toBe(false);
    expect(out.timestamps).toBe(true);
    expect(out.routeField).toBeNull();
  });

  it('сериализует icon, если она указана в схеме', () => {
    const schema = defineSchema({
      name: 'page',
      icon: 'Home01Icon',
      fields: { title: defineField.string({ label: 'Title' }) },
    });
    const out = serializeSchema(schema);
    expect(out.icon).toBe('Home01Icon');
  });

  it('сериализует order', () => {
    const schema = defineSchema({
      name: 'page',
      fields: { title: defineField.string({ label: 'Title' }) },
      order: 5,
    });
    const out = serializeSchema(schema);
    expect(out.order).toBe(5);
    expect(out.type).toBe('page');
    expect(out.singleton).toBe(false);
  });

  it('подставляет дефолт order', () => {
    const schema = defineSchema({
      name: 'page',
      fields: { title: defineField.string({ label: 'Title' }) },
    });
    const out = serializeSchema(schema);
    expect(out.order).toBe(0);
    expect(out.type).toBe('page');
    expect(out.singleton).toBe(false);
  });

  it('сериализует явный type и singleton', () => {
    const schema = defineSchema({
      name: 'home',
      type: 'home',
      singleton: true,
      fields: { title: defineField.string({ label: 'Title' }) },
    });
    const out = serializeSchema(schema);
    expect(out.type).toBe('home');
    expect(out.singleton).toBe(true);
  });

  it('сериализует richText без подполей', () => {
    const schema = defineSchema({
      name: 'home',
      singleton: true,
      fields: {
        body: defineField.richText({ label: 'Body', optional: true }),
      },
    });
    const out = serializeSchema(schema);
    const body = out.fields.body;
    if (body?.type !== 'richText') throw new Error('expected richText field');
    expect(body.optional).toBe(true);
    expect(body.label).toBe('Body');
  });

  it('сохраняет slug.unique по умолчанию true', () => {
    const schema = defineSchema({
      name: 'page',
      fields: {
        slug: defineField.slug({ label: 'Slug', source: 'title' }),
      },
    });
    const out = serializeSchema(schema);
    const slug = out.fields.slug;
    if (slug?.type !== 'slug') throw new Error('expected slug field');
    expect(slug.unique).toBe(true);
    expect(slug.source).toBe('title');
  });

  it('сериализует reference / object / array / union рекурсивно', () => {
    const schema = defineSchema({
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
                fields: {
                  title: defineField.string({ label: 'Title' }),
                  url: defineField.string({ label: 'URL' }),
                },
              }),
              page: defineField.object({
                label: 'Page',
                fields: {
                  ref: defineField.reference({ label: 'Ref', to: ['pages'] }),
                },
              }),
            },
          }),
        }),
      },
    });
    const out = serializeSchema(schema);
    const items = out.fields.items;
    if (items?.type !== 'array') throw new Error('expected array');
    if (items.of.type !== 'union') throw new Error('expected union');
    expect(items.of.discriminator).toBe('kind');
    expect(Object.keys(items.of.variants)).toEqual(['link', 'page']);
    const pageVariant = items.of.variants.page;
    expect(pageVariant?.fields.ref?.type).toBe('reference');
    if (pageVariant?.fields.ref?.type !== 'reference') throw new Error('not reference');
    expect(pageVariant.fields.ref.to).toEqual(['pages']);
  });
});
