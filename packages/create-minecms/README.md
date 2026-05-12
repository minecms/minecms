# create-minecms

Скэффолд нового проекта [MineCMS](https://minecms.ru) одной командой.

```bash
pnpm create minecms my-cms
# или
npx create-minecms my-cms
# или
yarn create minecms my-cms
```

CLI создаст папку `my-cms/`, положит туда `minecms.config.ts`, `docker-compose.yml`, `.env` с уже сгенерированным `SESSION_SECRET`, поставит зависимости и расскажет, как запустить.

## Опции

```
pnpm create minecms [имя] [--postgres|--mysql] [--no-install] [-y]
```

- `--postgres`, `--pg` — использовать PostgreSQL (по умолчанию).
- `--mysql` — использовать MySQL вместо PostgreSQL.
- `--no-install` — пропустить `install` (поставишь руками).
- `-y`, `--yes` — без вопросов, дефолты (`my-minecms`, Postgres).

## Дальше

```bash
cd my-cms
docker compose up -d     # БД + MinIO
pnpm dev                 # сервер + Studio на :3001
open http://localhost:3001/admin
```

Лицензия — Apache-2.0.
