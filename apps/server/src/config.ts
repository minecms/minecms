import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

/**
 * Драйверы БД, поддерживаемые на старте проекта.
 * Список **закрыт** — добавление нового драйвера = новая фаза в ROADMAP.
 */
export const databaseDrivers = ['mysql', 'postgres'] as const;
export type DatabaseDriver = (typeof databaseDrivers)[number];

/**
 * Zod-схема для переменных окружения. Любая правка — только через явный пункт roadmap.
 *
 * - `DATABASE_DRIVER` / `DATABASE_URL` могут быть пустыми на самой первой загрузке —
 *   тогда сервер стартует в install-режиме и ждёт, пока их пришлёт визард.
 * - `SESSION_SECRET` обязателен всегда: иначе подписать cookie нечем.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  HOST: z.string().min(1).default('127.0.0.1'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET должен быть минимум 32 символа (используй openssl rand -hex 32)'),
  DATABASE_DRIVER: z.enum(databaseDrivers).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  /**
   * Путь к `minecms.config.ts`. По умолчанию — поиск в `cwd` среди стандартных имён.
   * Поддерживается абсолютный или относительный (к `cwd`) путь.
   */
  MINECMS_CONFIG: z.string().min(1).optional(),
  /**
   * Авто-применять диффы пользовательских схем в БД при старте сервера и после `install.run`.
   * По умолчанию `true` — соответствует ожиданию schemas-as-code dev-цикла.
   */
  MINECMS_AUTO_MIGRATE: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),
  /**
   * Разрешить применение разрушительных миграций (DROP/RENAME колонок).
   * По умолчанию `false`: drizzle-kit ставит `hasDataLoss=true` → сервер
   * откладывает миграцию и просит пользователя явно подтвердить.
   */
  MINECMS_ALLOW_DATA_LOSS: z
    .union([z.literal('true'), z.literal('false')])
    .default('false')
    .transform((v) => v === 'true'),
  /**
   * S3 / S3-совместимое хранилище (MinIO, Cloudflare R2, Backblaze B2, …).
   *
   * Все S3_*-переменные опциональны на уровне Zod, но если хотя бы одна задана,
   * `loadStorageConfig` потребует полный набор: `bucket` + либо именованный
   * регион AWS, либо `S3_ENDPOINT` для совместимых сервисов. Без полной
   * конфигурации медиа-эндпоинты возвращают 503 — БД и сама CMS работают
   * в обычном режиме.
   */
  S3_ENDPOINT: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  /**
   * Path-style URL для MinIO и других сервисов без virtual-hosted style.
   * Включается автоматически при наличии `S3_ENDPOINT`, но можно переопределить.
   */
  S3_FORCE_PATH_STYLE: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  /**
   * Базовый публичный URL для отдачи файлов наружу (CDN, MinIO console, etc.).
   * Если не задан — Studio использует временные signed-URL через server-proxy.
   */
  S3_PUBLIC_URL: z.string().min(1).optional(),
  /**
   * Префикс ключей в bucket'е (без ведущего/завершающего `/`). По умолчанию
   * `media` — все загрузки попадают в `<bucket>/media/...`.
   */
  S3_KEY_PREFIX: z.string().default('media'),
  /**
   * Максимальный размер одного загружаемого файла в байтах. По умолчанию 25 MB.
   * Жёсткий потолок защищает от случайной заливки гигабайтных файлов.
   */
  MEDIA_MAX_FILE_SIZE: z.coerce
    .number()
    .int()
    .positive()
    .default(25 * 1024 * 1024),
});

export type ServerEnv = z.infer<typeof envSchema>;

/**
 * Состояние установки. Хранится:
 *   1) в БД (`system_state.installation_state`) — авторитетный источник после install,
 *   2) в файле `data/installation.json` — для свежей машины, когда .env ещё пустой.
 */
export const installationStates = ['pristine', 'installed'] as const;
export type InstallationState = (typeof installationStates)[number];

const installationFileSchema = z.object({
  driver: z.enum(databaseDrivers),
  url: z.string().min(1),
  state: z.enum(installationStates).default('pristine'),
});

export type InstallationFile = z.infer<typeof installationFileSchema>;

/**
 * Полная конфигурация подключения к S3/MinIO. Все поля обязательны:
 * `loadStorageConfig` собирает её из ENV только когда задан минимально
 * необходимый набор переменных. Иначе возвращает `null` и медиа-стек
 * считается выключенным.
 */
export interface StorageConfig {
  /** Имя bucket'а. */
  bucket: string;
  /** AWS-регион (обязателен для AWS, для MinIO — `us-east-1` по умолчанию). */
  region: string;
  /** Кастомный endpoint для S3-совместимых сервисов. Без него — нативный AWS S3. */
  endpoint?: string;
  /** Принудительный path-style: `endpoint/bucket/key` вместо virtual-hosted. */
  forcePathStyle: boolean;
  /** Access key. */
  accessKeyId: string;
  /** Secret key. */
  secretAccessKey: string;
  /** Базовый публичный URL (CDN или прямой доступ к bucket'у). */
  publicUrl?: string;
  /** Префикс ключей внутри bucket'а — изоляция от других файлов. */
  keyPrefix: string;
  /** Лимит размера одного файла, байты. */
  maxFileSize: number;
}

export interface ServerConfig {
  env: ServerEnv;
  /**
   * Подключение к БД, известное на момент старта. Может быть `null` —
   * это нормально для свежей машины, когда install-визард ещё не пройден.
   */
  database: { driver: DatabaseDriver; url: string } | null;
  /** Состояние установки на момент чтения конфигурации. */
  installationState: InstallationState;
  /** Абсолютный путь до `data/installation.json`. */
  installationFilePath: string;
  /** Конфигурация S3-совместимого хранилища или `null` если не настроена. */
  storage: StorageConfig | null;
}

/**
 * Собирает `StorageConfig` из ENV. Возвращает `null` если хотя бы одно
 * из обязательных полей (`bucket`, `accessKeyId`, `secretAccessKey`)
 * отсутствует — в этом случае медиа-эндпоинты будут отдавать 503.
 *
 * Для S3-совместимых сервисов (MinIO) задаётся `S3_ENDPOINT` — тогда регион
 * по умолчанию `us-east-1`, а `forcePathStyle` включается автоматически.
 */
export function loadStorageConfig(env: ServerEnv): StorageConfig | null {
  const { S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env;
  if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
    return null;
  }
  const region = env.S3_REGION ?? (env.S3_ENDPOINT ? 'us-east-1' : '');
  if (!region) {
    return null;
  }
  const forcePathStyle =
    env.S3_FORCE_PATH_STYLE !== undefined ? env.S3_FORCE_PATH_STYLE : Boolean(env.S3_ENDPOINT);
  const keyPrefix = env.S3_KEY_PREFIX.replace(/^\/+|\/+$/g, '');

  return {
    bucket: S3_BUCKET,
    region,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
    forcePathStyle,
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    ...(env.S3_PUBLIC_URL ? { publicUrl: env.S3_PUBLIC_URL.replace(/\/+$/, '') } : {}),
    keyPrefix,
    maxFileSize: env.MEDIA_MAX_FILE_SIZE,
  };
}

/**
 * Читает env, валидирует Zod, подмешивает значения из `data/installation.json`,
 * если файл существует. Файл побеждает .env — он отражает результат прохождения визарда.
 */
export function loadConfig(options?: { env?: NodeJS.ProcessEnv; cwd?: string }): ServerConfig {
  const rawEnv = options?.env ?? process.env;
  const cwd = options?.cwd ?? process.cwd();
  const env = envSchema.parse(rawEnv);

  const installationFilePath = resolve(cwd, 'data', 'installation.json');
  const fromFile = readInstallationFile(installationFilePath);

  const driver = fromFile?.driver ?? env.DATABASE_DRIVER ?? null;
  const url = fromFile?.url ?? env.DATABASE_URL ?? null;
  const database = driver && url ? { driver, url } : null;
  const installationState: InstallationState = fromFile?.state ?? 'pristine';

  const storage = loadStorageConfig(env);

  return { env, database, installationState, installationFilePath, storage };
}

function readInstallationFile(path: string): InstallationFile | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf8');
    return installationFileSchema.parse(JSON.parse(raw));
  } catch {
    // Сломанный файл лечит install-визард, не сервер. На старте — игнорируем.
    return null;
  }
}
