import { defineField, defineSchema } from '@minecms/core';
import { describe, expect, it } from 'vitest';
import { collectReferenceUsages } from './references';

describe('collectReferenceUsages', () => {
  it('собирает ссылки из плоских полей', () => {
    const schema = defineSchema({
      name: 'doc',
      fields: {
        author: defineField.reference({ label: 'Автор', to: ['authors'] }),
        title: defineField.string({ label: 'Title' }),
      },
    });
    const usages = collectReferenceUsages(schema, { author: 7, title: 'Hello' });
    expect(usages).toEqual([{ path: 'author', to: ['authors'], id: 7 }]);
  });

  it('обходит вложенные object/array', () => {
    const schema = defineSchema({
      name: 'doc',
      fields: {
        items: defineField.array({
          label: 'Items',
          of: defineField.object({
            label: 'Item',
            fields: {
              ref: defineField.reference({ label: 'Page', to: ['pages'] }),
              title: defineField.string({ label: 'Title' }),
            },
          }),
        }),
      },
    });
    const usages = collectReferenceUsages(schema, {
      items: [
        { ref: 1, title: 'A' },
        { ref: 2, title: 'B' },
      ],
    });
    expect(usages).toEqual([
      { path: 'items[0].ref', to: ['pages'], id: 1 },
      { path: 'items[1].ref', to: ['pages'], id: 2 },
    ]);
  });

  it('идёт по выбранному варианту union, игнорируя остальные', () => {
    const schema = defineSchema({
      name: 'menu',
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
                fields: {
                  ref: defineField.reference({ label: 'Page', to: ['pages'] }),
                },
              }),
            },
          }),
        }),
      },
    });
    const usages = collectReferenceUsages(schema, {
      items: [
        { kind: 'link', url: '/' },
        { kind: 'page', ref: 5 },
      ],
    });
    expect(usages).toEqual([{ path: 'items[1].ref', to: ['pages'], id: 5 }]);
  });

  it('игнорирует null/undefined значения', () => {
    const schema = defineSchema({
      name: 'doc',
      fields: {
        opt: defineField.reference({ label: 'Opt', to: ['x'], optional: true }),
      },
    });
    expect(collectReferenceUsages(schema, { opt: null })).toEqual([]);
    expect(collectReferenceUsages(schema, {})).toEqual([]);
  });
});
