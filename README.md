# MineCMS — монорепо

Opensource headless CMS на TypeScript с архитектурой **schemas-as-code**: разработчик описывает контент-модели в коде, Studio динамически строит UI, server динамически отдаёт CRUD по схемам.

## Структура

```
minecms/
├── apps/
│   ├── studio/   # Админка (Vite + React 19.2 + FSD)
│   └── server/   # Backend (Fastify v5 + tRPC v11)
├── packages/
│   ├── core/     # @minecms/core — defineSchema, defineField, defineConfig
│   ├── ui/       # @minecms/ui — design-system, токены, примитивы
│   └── sdk/      # @minecms/sdk — типизированный клиент для сайтов
├── docker-compose.dev.yml   # MySQL 8 + PostgreSQL 16
└── package.json
```

> На текущей стадии (Phase 1) — только конфиги монорепо. `apps/` и `packages/` появляются в фазах 2–8 (см. `../ROADMAP.md`).

## Требования

- **Node.js 24 LTS** (используй `nvm use` — версия в `.nvmrc`)
- **pnpm 10.x** (включить через corepack: `corepack enable && corepack prepare pnpm@latest --activate`)
- **Docker** + **Docker Compose** (для локальных БД)

## Установка

```bash
pnpm install
```

## Локальные сервисы (БД)

```bash
pnpm services:up        # поднять MySQL и PostgreSQL
pnpm services:logs      # логи в реальном времени
pnpm services:down      # остановить
pnpm services:reset     # остановить и удалить volumes (полный сброс данных)
```

Подключения по умолчанию:

| База | Хост | Порт | DB | User | Password |
|---|---|---|---|---|---|
| MySQL | localhost | 3306 | `minecms` | `minecms` | `minecms` |
| PostgreSQL | localhost | 5432 | `minecms` | `minecms` | `minecms` |

## Скрипты

| Команда | Описание |
|---|---|
| `pnpm dev` | Запуск всех `dev`-задач параллельно через Turbo |
| `pnpm build` | Сборка всех пакетов |
| `pnpm test` | Юнит-тесты (Vitest) |
| `pnpm typecheck` | TypeScript-проверка |
| `pnpm lint` | Проверка через Biome (lint + format) |
| `pnpm lint:fix` | Автофикс через Biome |
| `pnpm format` | Только форматирование |

## Принципы разработки

См. правила в `../.cursor/rules/`:

- `project-foundation.mdc` — архитектурные ограничения
- `language-and-tooling.mdc` — RU в комментах, EN в коде, только pnpm
- `fsd-frontend.mdc` — FSD-границы Studio
- `typescript-backend.mdc` — конвенции бекенда
- `no-skipping.mdc` — без отложенных пунктов

## Документация

- `../ROADMAP.md` — текущая фаза и план
- `../AGENTS.md` — точка входа для AI-агентов
