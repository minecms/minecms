import { defineField, defineSchema } from '@minecms/core';
import { describe, expect, it } from 'vitest';
import { _collectImageHolesForTests, schemaHasImageField } from './expand-images';

describe('schemaHasImageField', () => {
  it('видит image на верхнем уровне', () => {
    const s = defineSchema({
      name: 'page',
      fields: {
        title: defineField.string({ label: 'T' }),
        cover: defineField.image({ label: 'Cover', optional: true }),
      },
    });
    expect(schemaHasImageField(s)).toBe(true);
  });

  it('видит image внутри array<object>', () => {
    const s = defineSchema({
      name: 'page',
      fields: {
        gallery: defineField.array({
          label: 'Gallery',
          of: defineField.object({
            label: 'Item',
            fields: { picture: defineField.image({ label: 'P' }) },
          }),
        }),
      },
    });
    expect(schemaHasImageField(s)).toBe(true);
  });

  it('видит image в одном из variants union', () => {
    const s = defineSchema({
      name: 'page',
      fields: {
        block: defineField.union({
          label: 'Block',
          variants: {
            text: defineField.object({
              label: 'Text',
              fields: { value: defineField.string({ label: 'V' }) },
            }),
            hero: defineField.object({
              label: 'Hero',
              fields: { picture: defineField.image({ label: 'P' }) },
            }),
          },
        }),
      },
    });
    expect(schemaHasImageField(s)).toBe(true);
  });

  it('возвращает false, если image-полей нет', () => {
    const s = defineSchema({
      name: 'page',
      fields: {
        title: defineField.string({ label: 'T' }),
        body: defineField.text({ label: 'B', optional: true }),
      },
    });
    expect(schemaHasImageField(s)).toBe(false);
  });
});

describe('walker: сбор image-дырочек', () => {
  it('находит image на верхнем уровне', () => {
    const s = defineSchema({
      name: 'page',
      fields: {
        title: defineField.string({ label: 'T' }),
        cover: defineField.image({ label: 'Cover', optional: true }),
      },
    });
    const holes = _collectImageHolesForTests(s, [
      { title: 'A', cover: { assetId: 7, alt: 'Hello' } },
      { title: 'B', cover: null },
    ]);
    expect(holes).toEqual([{ assetId: 7, alt: 'Hello' }]);
  });

  it('игнорирует невалидные image-значения (assetId <= 0 / отсутствует)', () => {
    const s = defineSchema({
      name: 'page',
      fields: {
        cover: defineField.image({ label: 'Cover', optional: true }),
      },
    });
    const holes = _collectImageHolesForTests(s, [
      { cover: { assetId: 0 } },
      { cover: { assetId: -1, alt: 'x' } },
      { cover: {} },
    ]);
    expect(holes).toEqual([]);
  });

  it('идёт внутрь array и собирает все image', () => {
    const s = defineSchema({
      name: 'page',
      fields: {
        gallery: defineField.array({
          label: 'Gallery',
          of: defineField.object({
            label: 'Item',
            fields: {
              picture: defineField.image({ label: 'P' }),
              caption: defineField.string({ label: 'C', optional: true }),
            },
          }),
        }),
      },
    });
    const holes = _collectImageHolesForTests(s, [
      {
        gallery: [
          { picture: { assetId: 1 }, caption: 'A' },
          { picture: { assetId: 2, alt: 'two' }, caption: 'B' },
        ],
      },
    ]);
    expect(holes).toEqual([{ assetId: 1 }, { assetId: 2, alt: 'two' }]);
  });

  it('идёт внутрь union только по выбранному варианту', () => {
    const s = defineSchema({
      name: 'page',
      fields: {
        block: defineField.union({
          label: 'Block',
          variants: {
            text: defineField.object({
              label: 'Text',
              fields: { value: defineField.string({ label: 'V' }) },
            }),
            hero: defineField.object({
              label: 'Hero',
              fields: { picture: defineField.image({ label: 'P' }) },
            }),
          },
        }),
      },
    });
    const holes = _collectImageHolesForTests(s, [
      { block: { kind: 'text', value: 'hello' } },
      { block: { kind: 'hero', picture: { assetId: 9, alt: 'banner' } } },
    ]);
    expect(holes).toEqual([{ assetId: 9, alt: 'banner' }]);
  });
});
