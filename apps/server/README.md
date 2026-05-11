# `@minecms/server`

Backend MineCMS — HTTP-сервер на Fastify v5, tRPC v11, Drizzle ORM с поддержкой MySQL 8 и PostgreSQL 16.

## Структура

```
apps/server/
├── src/
│   ├── index.ts            # точка входа: запускает Fastify
│   ├── server.ts           # createServer() — собирает все плагины и роутеры
│   ├── config.ts           # zod-валидация переменных окружения
│   ├── logger.ts           # настроенный pino
│   ├── auth/
│   │   ├── password.ts     # argon2 hash + verify
│   │   └── session.ts      # подпись/проверка cookie сессии
│   ├── db/
│   │   ├── index.ts        # createDb(driver, url) — общая фабрика
│   │   ├── mysql/schema.ts # users, sessions, system_state — mysqlTable
│   │   └── postgres/schema.ts # users, sessions, system_state — pgTable
│   ├── trpc/
│   │   ├── core.ts         # initTRPC, middleware (installRequired, dbProcedure)
│   │   ├── context.ts      # ctx-фабрика (req/res, db, session)
│   │   ├── router.ts       # appRouter (health + install + auth + schemas + documents)
│   │   └── routers/
│   │       ├── install.ts  # status, testDatabase, run + push пользовательских схем
│   │       ├── auth.ts     # login, logout, me
│   │       ├── schemas.ts  # list — сериализованные SchemaDefinition для Studio
│   │       └── documents.ts # CRUD по schema-name: list/get/create/update/delete
│   ├── schemas/
│   │   ├── loader.ts       # динамический import minecms.config.ts
│   │   ├── tables.ts       # buildMysqlUserTables / buildPostgresUserTables
│   │   ├── migrate.ts      # applyUserSchemas через drizzle-kit/api
│   │   ├── serialize.ts    # SchemaDefinition → JSON для tRPC
│   │   └── reserved.ts     # резерв системных имён + snake_case
│   └── plugins/
│       ├── trpc.ts         # mount tRPC adapter
│       ├── rest.ts         # GET /api/v1/:schema, /api/v1/:schema/:slug
│       ├── cookies.ts      # @fastify/cookie с SESSION_SECRET
│       └── cors.ts         # @fastify/cors для Studio
├── migrations/
│   ├── mysql/              # SQL-миграции для MySQL (Drizzle Kit)
│   └── postgres/           # SQL-миграции для PostgreSQL (Drizzle Kit)
├── data/                   # runtime-state (installation.json) — не в git
├── drizzle.config.mysql.ts
├── drizzle.config.postgres.ts
└── .env.example
```

## Системные таблицы

Создаются миграциями обоих диалектов идентичной формы:

- `users(id, email, password_hash, role, created_at, updated_at)`
- `sessions(id, user_id, expires_at, created_at)`
- `system_state(key, value, updated_at)` — singleton-ключи `installation_state` и `installation_driver`.

## Жизненный цикл

1. `pnpm dev` запускает Fastify на `PORT` (по умолчанию 3333).
2. Сервер читает `data/installation.json` (если есть) и `.env`. Подключается к БД, читает `system_state`. Параллельно динамически загружает `minecms.config.ts` (см. `MINECMS_CONFIG`) и строит Drizzle-таблицы для пользовательских схем под оба диалекта.
3. Если `installation_state != 'installed'` — middleware `installRequired` блокирует `auth.*`/`documents.*`, открыты только `install.*`, `health`, `auth.me` (вернёт `null`) и `schemas.list`. REST `/api/v1/*` отдаёт 503.
4. Studio проходит install-визард → `install.run` создаёт админа, применяет системные миграции, пушит пользовательские схемы (через `drizzle-kit/api`), фиксирует state.
5. После install сервер обслуживает `auth.*`, tRPC `documents.*` (CRUD) и публичные REST-эндпоинты `/api/v1/:schema` для SDK.
6. На каждом старте уже-installed сервера, при `MINECMS_AUTO_MIGRATE=true` (default) и наличии `minecms.config.ts`, автоматически прогоняется push-диф через `drizzle-kit/api`. Деструктивные миграции отклоняются, пока не выставлен `MINECMS_ALLOW_DATA_LOSS=true`.

## Динамические схемы

Контент-модели объявляются разработчиком в `minecms.config.ts`:

```ts
import { defineConfig, defineSchema, defineField } from '@minecms/core';

const page = defineSchema({
  name: 'page',
  fields: {
    title: defineField.string({ label: 'Заголовок', max: 200 }),
    body: defineField.text({ label: 'Содержимое', optional: true }),
    slug: defineField.slug({ label: 'Slug', source: 'title' }),
  },
  routeField: 'slug',
});

export default defineConfig({
  database: { driver: 'mysql' },
  schemas: [page],
});
```

Сервер сам:
- сгенерит таблицу `page(id, title, body NULL, slug UNIQUE, created_at, updated_at)` под обоими диалектами;
- отдаст CRUD через tRPC: `documents.list({ schema: 'page', limit: 50 })`, `documents.get({ schema: 'page', slug: 'about' })`, `documents.create({ schema: 'page', data: {...} })`;
- отдаст read-only REST: `GET /api/v1/page`, `GET /api/v1/page/about`;
- расскажет Studio о схемах: `schemas.list` → `[ { name, label, fields: { ... }, routeField, ... } ]` с уже сериализованным `pattern: RegExp → string`.

Зарезервированные имена таблиц (нельзя использовать как `schema.name` после snake_case): `users`, `sessions`, `system_state`, `schema_migrations`, `__drizzle_migrations`.

## Команды

| Команда | Что делает |
|---|---|
| `pnpm --filter @minecms/server dev` | tsx watch — live-reload backend |
| `pnpm --filter @minecms/server start` | один прогон без watch |
| `pnpm --filter @minecms/server typecheck` | строгая проверка типов |
| `pnpm --filter @minecms/server test` | vitest run |
| `pnpm --filter @minecms/server db:generate:mysql` | сгенерировать SQL-миграции для MySQL по schema |
| `pnpm --filter @minecms/server db:generate:postgres` | то же для PostgreSQL |
| `pnpm --filter @minecms/server db:migrate:mysql` | применить миграции к MySQL |
| `pnpm --filter @minecms/server db:migrate:postgres` | применить миграции к PostgreSQL |

## ENV

| Переменная | По умолчанию | Что делает |
|---|---|---|
| `SESSION_SECRET` | — (обязательная, ≥32 символов) | Подпись signed-cookie сессии |
| `DATABASE_DRIVER` | `mysql` (если задан) | Драйвер БД, `mysql` или `postgres` |
| `DATABASE_URL` | — | Строка подключения к БД |
| `PORT` | `3333` | Порт Fastify |
| `HOST` | `127.0.0.1` | Bind-адрес |
| `LOG_LEVEL` | `info` | pino-уровень |
| `NODE_ENV` | `development` | dev / production / test |
| `MINECMS_CONFIG` | автопоиск | Путь к `minecms.config.ts` (абсолютный или относительно `cwd`) |
| `MINECMS_AUTO_MIGRATE` | `true` | Применять диффы пользовательских схем при старте |
| `MINECMS_ALLOW_DATA_LOSS` | `false` | Разрешить разрушительные диффы (DROP/RENAME колонок) |

## Зависимости

- `fastify@5`, `fastify-plugin`, `@fastify/cookie`, `@fastify/cors`
- `@trpc/server@11` (адаптер для Fastify)
- `drizzle-orm`, `drizzle-kit` (`drizzle-kit/api` — programmatic push), `mysql2`, `pg`
- `@node-rs/argon2` — prebuilt-биндинги без native-сборки
- `pino`, `pino-pretty`
- `zod` — валидация `.env` и входов tRPC
- `@minecms/core` — `defineSchema`/`defineField`/`defineConfig` + `schemaToZod`

Обе СУБД запускаются через корневой `docker-compose.dev.yml`:

```bash
pnpm services:up
```

После этого `mysql://minecms:minecms@127.0.0.1:3306/minecms` и `postgres://minecms:minecms@127.0.0.1:5432/minecms` доступны.
