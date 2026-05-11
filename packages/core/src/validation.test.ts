import { describe, expect, it } from 'vitest';
import { defineField } from './field';
import { defineSchema } from './schema';
import { fieldToZod, schemaToZod } from './validation';

describe('fieldToZod', () => {
  it('валидирует string с min/max', () => {
    const v = fieldToZod(defineField.string({ label: 'Title', min: 3, max: 10 }));
    expect(v.safeParse('ab').success).toBe(false);
    expect(v.safeParse('hello').success).toBe(true);
    expect(v.safeParse('toolongstringvalue').success).toBe(false);
  });

  it('валидирует slug по паттерну', () => {
    const v = fieldToZod(defineField.slug({ label: 'Slug' }));
    expect(v.safeParse('hello-world').success).toBe(true);
    expect(v.safeParse('Hello World').success).toBe(false);
    expect(v.safeParse('-leading').success).toBe(false);
    expect(v.safeParse('trailing-').success).toBe(false);
    expect(v.safeParse('a').success).toBe(true);
  });

  it('валидирует number c integer + min', () => {
    const v = fieldToZod(defineField.number({ label: 'N', integer: true, min: 0 }));
    expect(v.safeParse(5).success).toBe(true);
    expect(v.safeParse(-1).success).toBe(false);
    expect(v.safeParse(1.5).success).toBe(false);
  });

  it('валидирует boolean', () => {
    const v = fieldToZod(defineField.boolean({ label: 'B' }));
    expect(v.safeParse(true).success).toBe(true);
    expect(v.safeParse('true').success).toBe(false);
  });

  it('валидирует richText (ProseMirror doc)', () => {
    const v = fieldToZod(defineField.richText({ label: 'Body' }));
    const okEmpty = { type: 'doc' };
    const okWithContent = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Привет' }] },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }],
            },
          ],
        },
      ],
    };
    expect(v.safeParse(okEmpty).success).toBe(true);
    expect(v.safeParse(okWithContent).success).toBe(true);
    expect(v.safeParse({ type: 'paragraph' }).success).toBe(false);
    expect(v.safeParse('plain text').success).toBe(false);
  });

  it('optional-поле принимает null', () => {
    const v = fieldToZod(defineField.text({ label: 'Desc', optional: true }));
    expect(v.safeParse(null).success).toBe(true);
    expect(v.safeParse('hello').success).toBe(true);
  });

  it('обязательное поле не принимает null', () => {
    const v = fieldToZod(defineField.text({ label: 'Desc' }));
    expect(v.safeParse(null).success).toBe(false);
  });
});

describe('schemaToZod', () => {
  const page = defineSchema({
    name: 'page',
    fields: {
      title: defineField.string({ label: 'Title', min: 1, max: 200 }),
      slug: defineField.slug({ label: 'Slug' }),
      description: defineField.text({ label: 'Desc', optional: true }),
      published: defineField.boolean({ label: 'Published' }),
      order: defineField.number({ label: 'Order', integer: true, min: 0 }),
    },
  });
  const validator = schemaToZod(page);

  it('пропускает полностью валидный документ', () => {
    const result = validator.safeParse({
      title: 'Hello',
      slug: 'hello-world',
      description: 'desc',
      published: true,
      order: 1,
    });
    expect(result.success).toBe(true);
  });

  it('отклоняет документ с невалидным slug', () => {
    const result = validator.safeParse({
      title: 'Hello',
      slug: 'Hello World!',
      description: null,
      published: true,
      order: 1,
    });
    expect(result.success).toBe(false);
  });

  it('пропускает null для optional-полей', () => {
    const result = validator.safeParse({
      title: 'Hello',
      slug: 'hello',
      description: null,
      published: false,
      order: 0,
    });
    expect(result.success).toBe(true);
  });

  it('требует все обязательные поля', () => {
    const result = validator.safeParse({
      title: 'Hello',
    });
    expect(result.success).toBe(false);
  });
});

describe('fieldToZod: image', () => {
  it('принимает { assetId } и опциональный alt', () => {
    const v = fieldToZod(defineField.image({ label: 'Cover' }));
    expect(v.safeParse({ assetId: 1 }).success).toBe(true);
    expect(v.safeParse({ assetId: 1, alt: 'Подпись' }).success).toBe(true);
    expect(v.safeParse({ assetId: 0 }).success).toBe(false);
    expect(v.safeParse({ assetId: 1.5 }).success).toBe(false);
    expect(v.safeParse({ alt: 'no id' }).success).toBe(false);
    expect(v.safeParse(1).success).toBe(false);
  });

  it('optional image принимает null', () => {
    const v = fieldToZod(defineField.image({ label: 'Cover', optional: true }));
    expect(v.safeParse(null).success).toBe(true);
    expect(v.safeParse({ assetId: 1 }).success).toBe(true);
  });
});

describe('fieldToZod: reference', () => {
  it('принимает положительный целый id', () => {
    const v = fieldToZod(defineField.reference({ label: 'R', to: ['pages'] }));
    expect(v.safeParse(1).success).toBe(true);
    expect(v.safeParse(0).success).toBe(false);
    expect(v.safeParse(-1).success).toBe(false);
    expect(v.safeParse('1').success).toBe(false);
    expect(v.safeParse(1.5).success).toBe(false);
  });
});

describe('fieldToZod: object', () => {
  const v = fieldToZod(
    defineField.object({
      label: 'Address',
      fields: {
        city: defineField.string({ label: 'City' }),
        zip: defineField.string({ label: 'Zip', optional: true }),
      },
    }),
  );

  it('пропускает валидный вложенный объект', () => {
    expect(v.safeParse({ city: 'Berlin', zip: null }).success).toBe(true);
    expect(v.safeParse({ city: 'Berlin', zip: '10115' }).success).toBe(true);
  });

  it('требует обязательное вложенное поле', () => {
    expect(v.safeParse({ zip: null }).success).toBe(false);
  });
});

describe('fieldToZod: array', () => {
  const v = fieldToZod(
    defineField.array({
      label: 'Tags',
      of: defineField.string({ label: 'Tag' }),
      min: 1,
      max: 3,
    }),
  );

  it('обеспечивает min/max', () => {
    expect(v.safeParse([]).success).toBe(false);
    expect(v.safeParse(['a']).success).toBe(true);
    expect(v.safeParse(['a', 'b', 'c', 'd']).success).toBe(false);
  });

  it('валидирует тип элемента', () => {
    expect(v.safeParse(['a', 1]).success).toBe(false);
  });
});

describe('fieldToZod: union', () => {
  const v = fieldToZod(
    defineField.union({
      label: 'Item',
      variants: {
        link: defineField.object({
          label: 'Внешняя ссылка',
          fields: {
            title: defineField.string({ label: 'Title' }),
            url: defineField.string({ label: 'URL' }),
          },
        }),
        page: defineField.object({
          label: 'Страница',
          fields: {
            title: defineField.string({ label: 'Title' }),
            ref: defineField.reference({ label: 'Страница', to: ['pages'] }),
          },
        }),
      },
    }),
  );

  it('пропускает каждый вариант с правильным дискриминатором', () => {
    expect(v.safeParse({ kind: 'link', title: 'Home', url: '/' }).success).toBe(true);
    expect(v.safeParse({ kind: 'page', title: 'Home', ref: 1 }).success).toBe(true);
  });

  it('отклоняет неизвестный вариант и поля от другого варианта', () => {
    expect(v.safeParse({ kind: 'unknown', title: 't' }).success).toBe(false);
    expect(v.safeParse({ kind: 'link', title: 'Home', ref: 1 }).success).toBe(false);
  });
});

describe('schemaToZod: вложенные структуры round-trip', () => {
  const menu = defineSchema({
    name: 'menu',
    singleton: true,
    fields: {
      title: defineField.string({ label: 'Title' }),
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
            group: defineField.object({
              label: 'Group',
              fields: {
                title: defineField.string({ label: 'Title' }),
                children: defineField.array({
                  label: 'Children',
                  of: defineField.object({
                    label: 'Child',
                    fields: { title: defineField.string({ label: 'Title' }) },
                  }),
                }),
              },
            }),
          },
        }),
      }),
    },
  });

  it('пропускает дерево произвольной вложенности', () => {
    const v = schemaToZod(menu);
    const result = v.safeParse({
      title: 'Main',
      items: [
        { kind: 'link', title: 'Home', url: '/' },
        {
          kind: 'group',
          title: 'Docs',
          children: [{ title: 'Schemas' }, { title: 'Fields' }],
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
