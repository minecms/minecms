# __NAME__

Инстанс [MineCMS](https://minecms.ru) — opensource headless CMS на TypeScript с архитектурой schemas-as-code.

## Запуск

```bash
# 1. Поднять БД (Postgres или MySQL) и MinIO для медиа
docker compose up -d

# 2. Запустить CMS — backend + Studio админка
pnpm dev
```

Открой:

- **Studio**: <http://localhost:3001/admin>
- **REST API**: <http://localhost:3001/api/v1/...>
- **Health**: <http://localhost:3001/health>

При первом запуске сервер выведет в логах одноразовый **install-token**. Он также продублирован в `.env` под именем `INSTALL_TOKEN`. Открой `/admin/install`, введи токен — мастер установки создаст администратора и применит миграции по схемам.

## Структура

```
.
├── minecms.config.ts      ← Схемы контента (источник правды)
├── docker-compose.yml     ← Postgres/MySQL + MinIO для разработки
├── .env                   ← Секреты, DATABASE_URL, SESSION_SECRET
└── package.json
```

Чтобы добавить новый тип контента — опиши его в `minecms.config.ts` через `defineSchema()` и перезапусти сервер. Studio и API сами подхватят новые поля.

## Деплой

В production-окружении задай свои `DATABASE_URL`, `SESSION_SECRET` (32+ случайных байт), `HOST=0.0.0.0`, `PORT=...` и `MINECMS_AUTO_MIGRATE=true` (или применяй миграции вручную через `pnpm exec drizzle-kit`).

## Документация

- Лендинг: <https://minecms.ru>
- Ядро: <https://github.com/minecms/minecms>
- Issues: <https://github.com/minecms/minecms/issues>

Лицензия — Apache-2.0.
