# `@minecms/studio`

Frontend MineCMS — админка на Vite 8, React 19, TanStack Router/Query/Form, Tailwind v4 (через preset из `@minecms/ui`) и tRPC. Динамический UI по schemas-as-code: списки и формы рендерятся на основе схем, объявленных пользователем в `minecms.config.ts`.

## Структура (FSD)

```
apps/studio/
├── src/
│   ├── app/              # корневые провайдеры и точка входа React
│   │   ├── app.tsx
│   │   └── providers.tsx
│   ├── pages/            # экраны
│   │   ├── install/
│   │   ├── login/
│   │   └── dashboard/
│   ├── widgets/          # композиции крупнее feature
│   │   ├── app-shell/    # sidebar + topbar + content (shadcn dashboard)
│   │   └── install-shell/
│   ├── features/         # пользовательские сценарии
│   │   ├── install-database/
│   │   └── install-admin/
│   ├── entities/         # доменные сущности (Phase 7+)
│   ├── shared/
│   │   ├── api/          # tRPC client + transports (real / dev)
│   │   ├── lib/          # env, helpers
│   │   └── routes/       # TanStack Router setup
│   ├── dev/              # in-memory обработчики UI-dev режима
│   ├── styles/index.css  # @import '@minecms/ui/styles.css'
│   └── main.tsx
├── index.html
├── vite.config.ts
└── tsconfig.json
```

## Два режима работы

| Режим | Как запустить | Источник данных | Когда применяется |
|---|---|---|---|
| **Real** | `pnpm --filter @minecms/studio dev` | реальный `@minecms/server` (proxy `/api` → `http://127.0.0.1:3333` в `vite.config.ts`) | все production-сценарии и playground |
| **UI-dev** | `MINECMS_DEV_MODE=ui pnpm --filter @minecms/studio dev` | in-memory обработчики из `src/dev/` | разработка экранов Studio без поднятого backend |

UI-dev режим — это исключительно dev-инструмент для итерации по компонентам и экранам Studio. Он tree-shake'ится из production-бандла через статический условный импорт по `import.meta.env.MINECMS_DEV_MODE`. **Никогда не активируется в playground и не попадает в финальную сборку без явного флага.**

## Лейаут

Классический shadcn dashboard pattern:

- **`widgets/app-shell`** — sidebar (брендинг + навигация по схемам через `schemas.list`) слева, topbar (брендинг + меню пользователя) сверху, scrollable content-area по центру.
- **`widgets/install-shell`** — карточка визарда со степпером сверху и слотом для текущего шага.

Все цвета — токены из `@minecms/ui` (oklch-палитра, light/dark, `prefers-color-scheme`).

## Install-визард

```
/install → 3 шага:
  1. База данных (radio MySQL/Postgres + URL + кнопка «Проверить» → install.testDatabase)
  2. Администратор (email + пароль + подтверждение → install.run)
  3. Готово → переход на /login
```

Гарды:
- `/`, `/login`, `/dashboard`, `/schema/*` требуют `installation_state = installed`. Иначе — редирект на `/install`.
- `/install` редиректит на `/login`, если установка уже пройдена. Защита от повторной установки.

## Динамический контент (Phase 7)

После логина всё, что показывает Studio в области контента, строится из `schemas.list`:

- Sidebar — список ссылок по `schema.name`/`schema.label`.
- Dashboard (`/dashboard`) — карточки со счётчиками документов через `documents.count`.
- `/schema/$schemaName` — универсальная таблица. Колонки берутся из `schema.fields` в порядке объявления; кнопки «редактировать»/«удалить» в каждой строке.
- `/schema/$schemaName/new` и `/schema/$schemaName/$documentId` — универсальная форма на TanStack Form. Поля рендерятся через `entities/field-renderer/FieldInput`.

`entities/field-renderer/` — единственное место, где тип поля схемы превращается в React-компонент:

| `field.type` | Input | Display (таблица) |
|---|---|---|
| `string` | `<Input type="text">` с `min/max/pattern` | truncate-ячейка |
| `text` | `<Textarea>` (rows подбирается по `max`) | первые 80 символов + `…` |
| `slug` | `<Input>` + автогенерация из `source`-поля + `slugify` (поддержка кириллицы) | `<code>`-бейдж |
| `number` | `<Input type="number">` (`step=1` для `integer`) | `tabular-nums` |
| `boolean` | `<Switch>` с inline-row-лейблом | `<Badge variant="success/muted">` Да/Нет |

## tRPC

Импортирует тип `AppRouter` из `@minecms/server` напрямую (workspace-зависимость). Это единственная связь Studio с server-runtime: типы, не код.

## Команды

| Команда | Что делает |
|---|---|
| `pnpm --filter @minecms/studio dev` | Vite-dev на 5173 с прокси `/api` → backend |
| `pnpm --filter @minecms/studio dev:ui` | UI-dev режим без backend |
| `pnpm --filter @minecms/studio build` | production-бандл в `dist/` |
| `pnpm --filter @minecms/studio preview` | поднять собранный бандл локально |
| `pnpm --filter @minecms/studio typecheck` | строгая проверка типов |
| `pnpm --filter @minecms/studio test` | vitest run |
