import { assertType, describe, expect, it } from 'vitest';
import { defineField } from './field';
import { defineSchema } from './schema';
import type { InferSchemaType } from './types';

describe('defineSchema', () => {
  it('создаёт схему с полями', () => {
    const page = defineSchema({
      name: 'page',
      label: 'Страница',
      icon: 'Home01Icon',
      fields: {
        title: defineField.string({ label: 'Заголовок', max: 200 }),
        description: defineField.text({ label: 'Описание', optional: true }),
      },
    });
    expect(page.name).toBe('page');
    expect(page.label).toBe('Страница');
    expect(page.icon).toBe('Home01Icon');
    expect(page.fields.title.type).toBe('string');
    expect(page.fields.description.optional).toBe(true);
  });

  it('принимает только type вместо name', () => {
    const home = defineSchema({
      type: 'home',
      label: 'Главная',
      singleton: true,
      fields: {
        title: defineField.string({ label: 'Заголовок' }),
      },
    });
    expect(home.name).toBe('home');
    expect(home.type).toBe('home');
    expect(home.singleton).toBe(true);
  });

  it('запрещает разные name и type', () => {
    expect(() =>
      defineSchema({
        name: 'a',
        type: 'b',
        fields: { title: defineField.string({ label: 'T' }) },
      }),
    ).toThrow(/must be the same/);
  });

  it('запрещает имя с недопустимыми символами', () => {
    expect(() =>
      defineSchema({
        name: 'Page!',
        fields: { title: defineField.string({ label: 'Title' }) },
      }),
    ).toThrow(/lowercase ASCII/);
  });

  it('запрещает имя, начинающееся с цифры', () => {
    expect(() =>
      defineSchema({
        name: '1page',
        fields: { title: defineField.string({ label: 'Title' }) },
      }),
    ).toThrow(/lowercase ASCII/);
  });

  it('запрещает пустой набор полей', () => {
    expect(() =>
      defineSchema({
        name: 'empty',
        fields: {},
      }),
    ).toThrow(/at least one field/);
  });

  it('запрещает routeField, не существующий в полях', () => {
    expect(() =>
      defineSchema({
        name: 'page',
        fields: { title: defineField.string({ label: 'Title' }) },
        routeField: 'nonexistent' as 'title',
      }),
    ).toThrow(/routeField/);
  });

  it('тип InferSchemaType корректно выводит обязательные и optional поля', () => {
    const page = defineSchema({
      name: 'page',
      fields: {
        title: defineField.string({ label: 'Title' }),
        description: defineField.text({ label: 'Desc', optional: true }),
        order: defineField.number({ label: 'Order' }),
        published: defineField.boolean({ label: 'Published' }),
      },
    });

    type Page = InferSchemaType<typeof page>;

    // Compile-time проверка: значение должно соответствовать типу.
    // Если InferSchemaType сломается — typecheck упадёт здесь.
    const sample: Page = {
      title: 'hello',
      description: null,
      order: 1,
      published: true,
    };
    assertType<Page>(sample);
    expect(sample.title).toBe('hello');
    expect(sample.description).toBeNull();
  });
});
