# Схемы контента (schemas-as-code)

Документ описывает **пользовательский путь**: от `defineSchema` в коде до таблицы в БД, форм в Studio и типизированного клиента на сайте. Идентификаторы в примерах — на английском, комментарии и подписи UI — на русском (как в проекте).

## Идея

- Одна декларация схемы в TypeScript — **единственный источник правды**.
- **Server** генерирует таблицу Drizzle, миграции и CRUD (tRPC + read-only REST).
- **Studio** получает сериализованную схему через `schemas.list` и рисует списки и формы.
- **SDK** на сайте знает поля документа через `InferSchemaType` и `schemasToSdkMap`.

## Минимальный пример

Файл схемы (как в `playground/minecms/schemas/pages.ts`):

```ts
import { defineField, defineSchema } from '@minecms/core';

export const pages = defineSchema({
  name: 'pages',
  pluralName: 'pages',
  label: 'Страницы',
  icon: 'File01Icon',
  routeField: 'slug',
  timestamps: true,
  fields: {
    title: defineField.string({ label: 'Заголовок', max: 160 }),
    slug: defineField.slug({
      label: 'URL-сегмент',
      source: 'title',
      unique: true,
    }),
    body: defineField.text({ label: 'Содержимое', optional: true }),
    published: defineField.boolean({ label: 'Опубликовано', default: false }),
  },
});
```

Подключение в `minecms.config.ts`:

```ts
import { defineConfig, schemasToSdkMap } from '@minecms/core';
import { pages } from './schemas/pages';

export default defineConfig({
  database: { driver: 'postgres' },
  schemas: [pages],
  server: { port: 3333, cors: ['http://localhost:5173'] },
});

export const schemas = schemasToSdkMap([pages]);
```

После изменения схемы перезапусти server с учётом `MINECMS_AUTO_MIGRATE` (см. `.env.example` в playground).

## Имя схемы и таблица

- Поле **`name`** (или **`type`**, но должны совпадать с `name`) — латиница, `kebab-case` / `snake_case`, согласно правилам `defineSchema`.
- В URL Studio: `/schema/<name>`, в REST: `/api/v1/<name>`.
- В БД имя таблицы производится от `name` (детали — в коде server `schemas/tables`).

## Полезные опции схемы

| Опция | Назначение |
|--------|------------|
| `label` | Заголовок в Studio (лучше на русском). |
| `icon` | Имя иконки Hugeicons, например `Home01Icon`, `File01Icon` (см. `@hugeicons/core-free-icons`). |
| `order` | Сортировка во втором сайдбаре, если нет `studioStructure`. |
| `singleton` | Одна запись: нет списка, форма сразу по `/schema/<name>`. |
| `pluralName` | Множественное число для UI; иначе используется эвристика. |
| `routeField` | Поле для публичного маршрута по slug (`GET /api/v1/:schema/:slug`). Должно указывать на поле типа `slug` из `fields`. |
| `timestamps` | Автополя `createdAt` / `updatedAt` (по умолчанию `true`). |

## Singleton

```ts
export const home = defineSchema({
  name: 'home',
  label: 'Главная',
  singleton: true,
  order: -10,
  icon: 'Home01Icon',
  fields: {
    title: defineField.string({ label: 'Заголовок', max: 200 }),
    intro: defineField.text({ label: 'Вступление', optional: true }),
  },
});
```

В Studio: прямой переход к редактированию единственной записи; кнопка «К списку» скрыта, «Сохранить» активна только при изменениях формы.

## Структура второго сайдбара (`studioStructure`)

Чтобы задать порядок разделов и разделители (отдельно от порядка полей в схеме), в `defineConfig` передай объект из `defineStudioStructure`:

```ts
import { defineConfig, defineStudioStructure } from '@minecms/core';

const contentStructure = defineStudioStructure({
  title: 'Контент',
  items: [
    { kind: 'schema', name: 'navigation' },
    { kind: 'divider' },
    { kind: 'schema', name: 'home' },
    { kind: 'schema', name: 'pages' },
  ],
});

export default defineConfig({
  // ...
  studioStructure: contentStructure,
});
```

Все `name` в пунктах `kind: 'schema'` должны входить в `schemas`. Допустимы только объявленные схемы и `divider`.

## Типы полей

Кратко: `string`, `text`, `slug`, `number`, `boolean`. Подробности и расширение ядра — в [`fields.md`](./fields.md).

## Цепочка данных

1. **Код** — `defineSchema` / `defineField` в репозитории пользователя.
2. **Сервер** при старте загружает `minecms.config.ts`, валидирует, строит Zod и таблицы, отдаёт `schemas.list` и `documents.*`.
3. **Studio** — формы и таблицы по сериализованной схеме (`SerializedSchema`).
4. **Сайт** — `createClient({ url, schemas })`, затем `client.pages.list()`, `client.pages.get('my-slug')` и т.д.

Пример клиента (playground `demo/src/lib/cms.ts`):

```ts
import { createClient } from '@minecms/sdk';
import { schemas } from '../../../minecms/minecms.config';

export const cms = createClient({
  url: import.meta.env.VITE_CMS_URL ?? 'http://localhost:3333',
  schemas,
});
```

## Где смотреть код

- `@minecms/core` — `defineSchema`, `defineField`, `defineConfig`, `defineStudioStructure`, `schemasToSdkMap`, валидация.
- `apps/server` — загрузка конфига, таблицы Drizzle, tRPC `documents`, REST `/api/v1`.
- `apps/studio` — `entities/field-renderer`, страницы `/schema/...`.
- `packages/sdk` — `createClient`, типы ответов.

## См. также

- [`fields.md`](./fields.md) — поля и как добавить новый тип в ядро.
- [`../playground/minecms/README.md`](../../playground/minecms/README.md) — запуск демо-инстанса.
