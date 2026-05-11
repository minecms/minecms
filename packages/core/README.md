# @minecms/core

Ядро MineCMS — декларация контент-моделей, валидация, корневой конфиг.

## Что внутри

- **`defineField`** — типизированные конструкторы полей: `string`, `text`, `slug`, `number`, `boolean`.
- **`defineSchema`** — описание сущности (имя, поля, label, routeField, timestamps).
- **`defineConfig`** — корневой конфиг приложения (БД, схемы, server-options).
- **`schemaToZod`** / **`fieldToZod`** — автогенерация Zod-валидатора по схеме.
- **`InferSchemaType<S>`** — type-level вывод TypeScript-типа документа из схемы.

## Пример

```ts
import { defineSchema, defineField, defineConfig } from '@minecms/core';

const page = defineSchema({
  name: 'page',
  label: 'Страница',
  fields: {
    title: defineField.string({ label: 'Заголовок', min: 1, max: 200 }),
    slug: defineField.slug({ label: 'Slug', source: 'title' }),
    description: defineField.text({ label: 'Описание', optional: true }),
  },
});

export default defineConfig({
  database: { driver: 'mysql' },
  schemas: [page],
});
```

Тип документа выводится автоматически:

```ts
import type { InferSchemaType } from '@minecms/core';

type Page = InferSchemaType<typeof page>;
// { title: string; slug: string; description: string | null }
```

## Стадия

Phase 2 ROADMAP — минимальный набор полей и валидации. Новые типы полей добавляются отдельными фазами.
