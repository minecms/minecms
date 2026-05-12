import { dirname } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { loadConfig } from './config';
import { createDb, readInstallationStateFromDb } from './db';
import { ensureInstallToken, logInstallTokenBanner } from './install-token';
import { createLogger } from './logger';
import { cookiesPlugin } from './plugins/cookies';
import { corsPlugin } from './plugins/cors';
import { mediaPlugin } from './plugins/media';
import { restPlugin } from './plugins/rest';
import { studioPlugin } from './plugins/studio';
import { trpcPlugin } from './plugins/trpc';
import {
  applyUserSchemas,
  databaseNameFromUrl,
  type LoadedUserConfig,
  loadUserConfig,
} from './schemas';
import { createServerState, type ServerState } from './state';

export interface CreateServerResult {
  app: FastifyInstance;
  state: ServerState;
}

/**
 * Собирает Fastify-инстанс: читает конфиг, поднимает (если возможно) подключение
 * к БД, регистрирует cookie/cors/tRPC-плагины. Не вызывает `listen` — это
 * ответственность вызывающего кода (см. `index.ts`).
 *
 * Дополнительно: при `installation_state=installed` и загруженном `minecms.config.ts`
 * подтягиваются пользовательские таблицы: при `MINECMS_AUTO_MIGRATE=true` — полный
 * push drizzle-kit, при `false` — только безопасное выравнивание (RENAME `page`→`pages`, CREATE недостающих).
 */
export async function createServer(options?: {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}): Promise<CreateServerResult> {
  const cwd = options?.cwd ?? process.cwd();
  const config = loadConfig(options ?? {});
  const logger = createLogger(config.env);

  const userConfig = await loadUserConfigSafe(
    { cwd, ...(config.env.MINECMS_CONFIG ? { configPath: config.env.MINECMS_CONFIG } : {}) },
    logger,
  );

  let db = null as Awaited<ReturnType<typeof createDb>> | null;
  let installationState = config.installationState;

  if (config.database) {
    try {
      db = await createDb(config.database);
      installationState = await readInstallationStateFromDb(db);
      logger.info(
        { driver: config.database.driver, installationState },
        'Подключение к БД установлено',
      );
    } catch (error) {
      logger.warn(
        { error, driver: config.database.driver },
        'Не удалось подключиться к БД при старте — переходим в install-режим',
      );
      db = null;
      installationState = 'pristine';
    }
  } else {
    logger.info('БД не сконфигурирована — сервер в install-режиме');
  }

  const state = createServerState({ config, logger, db, userConfig });
  state.installationState = installationState;

  // pristine-инстанс: гарантируем наличие одноразового install-token
  // на диске (`data/install.token`, perm 0600) и логируем его в stdout —
  // владелец вводит его в первом шаге install-визарда. Защищает анонимные
  // `install.testDatabase`/`install.run` от внешнего вызова до установки.
  if (installationState === 'pristine') {
    const tokenFilePath = `${dirname(config.installationFilePath)}/install.token`;
    const token = ensureInstallToken(tokenFilePath);
    logInstallTokenBanner({ logger, token });
  }

  // Системные миграции drizzle идемпотентны (трекаются по таблице
  // `__drizzle_migrations`) — безопасно прогонять их каждый старт. Это нужно,
  // чтобы уже установленные раньше инстансы получили новые системные таблицы
  // (например, `media_assets` из Phase 13) без ручного запуска CLI.
  if (db && installationState === 'installed') {
    try {
      await db.runMigrations();
    } catch (error) {
      logger.error({ error }, 'Не удалось применить системные миграции при старте');
    }
  }

  if (db && installationState === 'installed' && userConfig) {
    try {
      const databaseName =
        config.database?.driver === 'mysql' && config.database.url
          ? databaseNameFromUrl('mysql', config.database.url)
          : '';
      const result = await applyUserSchemas({
        db,
        schemas: userConfig.schemas,
        databaseName,
        allowDataLoss: config.env.MINECMS_ALLOW_DATA_LOSS,
        skipPush: !config.env.MINECMS_AUTO_MIGRATE,
      });
      if (result.skippedReason) {
        logger.warn({ warnings: result.warnings }, result.skippedReason);
      }
      if (result.applied.length > 0) {
        logger.info(
          {
            applied: result.applied.length,
            warnings: result.warnings,
            partial: Boolean(result.skippedReason),
          },
          result.skippedReason
            ? 'Созданы отсутствующие таблицы; деструктивный дифф схем не применён'
            : config.env.MINECMS_AUTO_MIGRATE
              ? 'Применены изменения пользовательских схем'
              : 'Безопасное выравнивание таблиц (без drizzle push)',
        );
      }
    } catch (error) {
      logger.error({ error }, 'Не удалось автоматически применить пользовательские схемы');
    }
  }

  const app = Fastify({
    logger: { level: config.env.LOG_LEVEL },
    trustProxy: true,
    disableRequestLogging: config.env.NODE_ENV === 'production',
  });

  await app.register(cookiesPlugin, { env: config.env });
  await app.register(corsPlugin, {
    env: config.env,
    userOrigins: userConfig?.config.server?.cors ?? [],
  });
  await app.register(trpcPlugin, { state });
  await app.register(mediaPlugin, { state });
  await app.register(restPlugin, { state });
  await app.register(studioPlugin);

  app.get('/health', async () => ({ ok: true, installationState: state.installationState }));

  app.addHook('onClose', async () => {
    if (state.db) {
      await state.db.close();
    }
    if (state.storage) {
      state.storage.destroy();
    }
  });

  return { app, state };
}

/**
 * Обёртка над `loadUserConfig`, которая логирует ошибку и возвращает `null`.
 * Сломанный конфиг не должен блокировать приложение целиком — пусть сервер поднимется
 * в install-режиме и пользователь починит файл, увидев лог.
 */
async function loadUserConfigSafe(
  options: { cwd: string; configPath?: string },
  logger: ReturnType<typeof createLogger>,
): Promise<LoadedUserConfig | null> {
  try {
    const result = await loadUserConfig(options);
    if (result) {
      logger.info(
        { configPath: result.configPath, schemas: result.schemas.length },
        'Загружен minecms.config.ts',
      );
    }
    return result;
  } catch (error) {
    logger.error({ error }, 'Не удалось загрузить minecms.config.ts');
    return null;
  }
}
