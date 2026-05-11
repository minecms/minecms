import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SchemaDefinition } from '@minecms/core';
import type { MySqlTable } from 'drizzle-orm/mysql-core';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { Logger } from 'pino';
import type { InstallationState, ServerConfig } from './config';
import type { MineDb } from './db';
import { MediaStorage } from './media/storage';
import {
  buildMysqlUserTables,
  buildPostgresUserTables,
  type LoadedUserConfig,
  type UserTables,
} from './schemas';

/**
 * Изменяемое runtime-состояние сервера. Один экземпляр на процесс.
 *
 * Содержит "горячее" подключение к БД, которое можно подменить во время прохождения
 * install-визарда (когда пользователь только что прислал реальные креды в `install.run`).
 * Контексты tRPC читают это состояние на каждом запросе, поэтому подмена `db` здесь
 * автоматически становится видна следующим вызовам `auth.*` и пользовательским роутам.
 */
export interface ServerState {
  config: ServerConfig;
  logger: Logger;
  db: MineDb | null;
  installationState: InstallationState;
  /**
   * Загруженный `minecms.config.ts` пользователя. `null` — конфиг не найден,
   * сервер работает только с системными процедурами.
   */
  userConfig: LoadedUserConfig | null;
  /**
   * Кешированные пользовательские схемы. Дублируется из `userConfig.schemas`
   * для удобного быстрого доступа в роутерах.
   */
  userSchemas: SchemaDefinition[];
  /**
   * Drizzle-таблицы под пользовательские схемы для каждого диалекта.
   * Строятся один раз при загрузке конфига, чтобы не пересоздавать на каждом запросе.
   */
  userTables: {
    mysql: UserTables<MySqlTable>;
    postgres: UserTables<PgTable>;
  };
  /**
   * Активный клиент S3-совместимого хранилища или `null`, если ENV не
   * сконфигурирован. Создаётся один раз на процесс — keep-alive, ленивый
   * (фактическое соединение поднимется только при первом запросе).
   */
  storage: MediaStorage | null;
}

export function createServerState(args: {
  config: ServerConfig;
  logger: Logger;
  db: MineDb | null;
  userConfig?: LoadedUserConfig | null;
}): ServerState {
  const userConfig = args.userConfig ?? null;
  const userSchemas = userConfig?.schemas ?? [];
  return {
    config: args.config,
    logger: args.logger,
    db: args.db,
    installationState: args.config.installationState,
    userConfig,
    userSchemas,
    userTables: {
      mysql: buildMysqlUserTables(userSchemas),
      postgres: buildPostgresUserTables(userSchemas),
    },
    storage: args.config.storage ? new MediaStorage(args.config.storage) : null,
  };
}

/**
 * Закрывает текущее соединение (если есть) и подменяет его новым.
 * Используется install.run после успешной миграции свежей БД.
 *
 * `url` нужен для синхронизации `state.config.database` — следующий старт сервера
 * будет читать его уже из `data/installation.json` через `loadConfig`.
 */
export async function swapDb(state: ServerState, next: MineDb, url: string): Promise<void> {
  if (state.db) {
    try {
      await state.db.close();
    } catch (error) {
      state.logger.warn({ error }, 'Не удалось закрыть старое соединение БД при swap');
    }
  }
  state.db = next;
  state.config = {
    ...state.config,
    database: { driver: next.driver, url },
  };
}

/**
 * Записывает файл `data/installation.json`. Это маркер «установка пройдена», который
 * сервер читает при следующем старте, чтобы не показать визард повторно.
 */
export function persistInstallationFile(args: {
  filePath: string;
  driver: 'mysql' | 'postgres';
  url: string;
  state: InstallationState;
}): void {
  mkdirSync(dirname(args.filePath), { recursive: true });
  const payload = JSON.stringify(
    { driver: args.driver, url: args.url, state: args.state },
    null,
    2,
  );
  writeFileSync(args.filePath, `${payload}\n`, { encoding: 'utf8', mode: 0o600 });
}
