import { describe, expect, it } from 'vitest';
import { defineField, isNestedField, isScalarField } from './field';

describe('defineField', () => {
  it('создаёт string-поле с правильным type-tag', () => {
    const f = defineField.string({ label: 'Заголовок', max: 200 });
    expect(f.type).toBe('string');
    expect(f.label).toBe('Заголовок');
    expect(f.max).toBe(200);
  });

  it('создаёт text-поле', () => {
    const f = defineField.text({ label: 'Описание' });
    expect(f.type).toBe('text');
  });

  it('создаёт slug-поле с source', () => {
    const f = defineField.slug({ label: 'Slug', source: 'title' });
    expect(f.type).toBe('slug');
    expect(f.source).toBe('title');
  });

  it('создаёт number-поле с integer + min/max', () => {
    const f = defineField.number({ label: 'Order', integer: true, min: 0, max: 100 });
    expect(f.type).toBe('number');
    expect(f.integer).toBe(true);
    expect(f.min).toBe(0);
    expect(f.max).toBe(100);
  });

  it('создаёт boolean-поле с default', () => {
    const f = defineField.boolean({ label: 'Опубликовано', default: false });
    expect(f.type).toBe('boolean');
    expect(f.default).toBe(false);
  });

  it('создаёт richText-поле', () => {
    const f = defineField.richText({ label: 'Контент', optional: true });
    expect(f.type).toBe('richText');
    expect(f.optional).toBe(true);
  });

  it('создаёт image-поле и сохраняет accept', () => {
    const f = defineField.image({
      label: 'Главное изображение',
      optional: true,
      accept: ['image/png', 'image/jpeg'],
    });
    expect(f.type).toBe('image');
    expect(f.optional).toBe(true);
    expect(f.accept).toEqual(['image/png', 'image/jpeg']);
  });

  it('сохраняет optional-флаг', () => {
    const f = defineField.text({ label: 'Описание', optional: true });
    expect(f.optional).toBe(true);
  });

  it('создаёт reference-поле и валидирует "to"', () => {
    const f = defineField.reference({ label: 'Страница', to: ['pages'] });
    expect(f.type).toBe('reference');
    expect(f.to).toEqual(['pages']);
    expect(() => defineField.reference({ label: 'X', to: [] as unknown as string[] })).toThrow(
      /non-empty/,
    );
  });

  it('создаёт object-поле; пустой fields запрещён', () => {
    const f = defineField.object({
      label: 'Адрес',
      fields: {
        city: defineField.string({ label: 'Город' }),
      },
    });
    expect(f.type).toBe('object');
    expect(Object.keys(f.fields)).toEqual(['city']);
    expect(() => defineField.object({ label: 'Empty', fields: {} })).toThrow(/at least one/);
  });

  it('создаёт array-поле над скаляром', () => {
    const f = defineField.array({
      label: 'Теги',
      of: defineField.string({ label: 'Тег' }),
      max: 50,
    });
    expect(f.type).toBe('array');
    expect(f.of.type).toBe('string');
    expect(f.max).toBe(50);
  });

  it('создаёт union-поле и проставляет дискриминатор по умолчанию', () => {
    const f = defineField.union({
      label: 'Пункт меню',
      variants: {
        link: defineField.object({
          label: 'Ссылка',
          fields: { url: defineField.string({ label: 'URL' }) },
        }),
        page: defineField.object({
          label: 'Страница',
          fields: { id: defineField.reference({ label: 'Страница', to: ['pages'] }) },
        }),
      },
    });
    expect(f.type).toBe('union');
    expect(f.discriminator).toBe('kind');
  });

  it('union отвергает один вариант и конфликт имени дискриминатора', () => {
    expect(() =>
      defineField.union({
        label: 'X',
        variants: {
          only: defineField.object({
            label: 'O',
            fields: { v: defineField.string({ label: 'v' }) },
          }),
        },
      }),
    ).toThrow(/at least 2/);

    expect(() =>
      defineField.union({
        label: 'X',
        discriminator: 'kind',
        variants: {
          a: defineField.object({
            label: 'A',
            fields: { kind: defineField.string({ label: 'k' }) },
          }),
          b: defineField.object({
            label: 'B',
            fields: { x: defineField.string({ label: 'x' }) },
          }),
        },
      }),
    ).toThrow(/discriminator/);
  });

  it('isScalarField / isNestedField — взаимоисключающие type-guards', () => {
    expect(isScalarField(defineField.string({ label: 's' }))).toBe(true);
    expect(isScalarField(defineField.boolean({ label: 'b' }))).toBe(true);
    expect(isScalarField(defineField.reference({ label: 'r', to: ['x'] }))).toBe(false);

    expect(isNestedField(defineField.reference({ label: 'r', to: ['x'] }))).toBe(true);
    expect(
      isNestedField(defineField.array({ label: 'a', of: defineField.string({ label: 's' }) })),
    ).toBe(true);
    expect(
      isNestedField(
        defineField.object({ label: 'o', fields: { s: defineField.string({ label: 's' }) } }),
      ),
    ).toBe(true);
    expect(isNestedField(defineField.string({ label: 's' }))).toBe(false);
  });
});
