# `@minecms/sdk`

Типизированный клиент MineCMS-server для пользовательских сайтов и backend-сервисов на TypeScript.

## Что делает

- Принимает карту схем (`schemas`) из `minecms.config.ts` пользователя.
- На её основе строит клиент: `cms.<schemaName>.list()` / `.get(slug)`.
- Тип каждого документа выводится через `InferSchemaType<typeof schema>` из `@minecms/core` — никакого ручного дублирования.
- Под капотом — `fetch` к публичным REST-эндпоинтам сервера (`GET /api/v1/:schema`, `GET /api/v1/:schema/:slug`).

## Установка

В playground / production-проекте, где уже есть workspace-зависимость от пакетов CMS:

```ts
import { createClient } from '@minecms/sdk';
import { schemas } from '../minecms/minecms.config';

export const cms = createClient({
  url: import.meta.env.VITE_CMS_URL ?? 'http://localhost:3333',
  schemas,
});
```

## API

### `createClient(options)`

| Опция | Тип | Описание |
|---|---|---|
| `url` | `string` | Базовый URL MineCMS-server. Завершающие `/` обрезаются. |
| `schemas` | `Record<string, SchemaDefinition>` | Карта схем из `defineSchema()`. Ключ становится именем поля клиента. |
| `token` | `string \| undefined` | Bearer-токен. Подставляется в `Authorization`. |
| `fetch` | `typeof fetch \| undefined` | Кастомная реализация. По умолчанию — `globalThis.fetch`. |
| `headers` | `Record<string, string> \| undefined` | Дополнительные заголовки для всех запросов. |

### `cms.<schemaName>.list(options?)`

Возвращает страницу документов:

```ts
const { items, total, limit, offset } = await cms.pages.list({ limit: 20, offset: 0 });
```

`items` имеет тип `InferSchemaType<typeof schema>[]`.

| Опция | Тип | По умолчанию |
|---|---|---|
| `limit` | `number` | `50` (максимум на сервере — 200) |
| `offset` | `number` | `0` |
| `signal` | `AbortSignal` | — |

### `cms.<schemaName>.get(slug, options?)`

Возвращает один документ по `routeField`. Если у схемы нет `routeField` — server вернёт `400 ROUTE_FIELD_NOT_DEFINED`.

```ts
const doc = await cms.pages.get('about');
//    ^? { id: number; title: string; slug: string; body: string | null; ... }
```

## Ошибки

Любая HTTP- или network-ошибка оборачивается в `MineCMSError`:

```ts
import { MineCMSError } from '@minecms/sdk';

try {
  await cms.pages.get('does-not-exist');
} catch (err) {
  if (err instanceof MineCMSError) {
    console.error(err.status, err.code, err.message);
  }
}
```

| Поле | Описание |
|---|---|
| `status` | HTTP-код. `0` — network/CORS-ошибка. |
| `code` | Машиночитаемый код из тела ответа (`NOT_FOUND`, `INSTALL_REQUIRED`, …) или `'NETWORK'` / `'BAD_RESPONSE'`. |
| `message` | Сообщение из тела ответа или fallback. |

## Команды пакета

| Команда | Что делает |
|---|---|
| `pnpm --filter @minecms/sdk build` | tsup → ESM-бандл + `.d.ts` в `dist/` |
| `pnpm --filter @minecms/sdk typecheck` | строгая проверка типов |
| `pnpm --filter @minecms/sdk test` | vitest (mock-fetch) |
