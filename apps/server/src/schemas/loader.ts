import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ConfigDefinition, SchemaDefinition } from '@minecms/core';
import { validateStudioStructure } from '@minecms/core';
import { RESERVED_TABLE_NAMES, schemaToTableName } from './reserved';

/**
 * Полностью загруженная пользовательская конфигурация MineCMS.
 *
 * `null` означает «файла нет / не указан» — сервер всё ещё может стартовать
 * в install-режиме и обслуживать только системные процедуры.
 */
export interface LoadedUserConfig {
  /** Абсолютный путь до `minecms.config.ts`, который удалось загрузить. */
  configPath: string;
  /** Распакованный default-export. */
  config: ConfigDefinition;
  /** Шорткат к схемам с уже валидированными именами. */
  schemas: SchemaDefinition[];
}

export interface LoadUserConfigOptions {
  /** Рабочая директория, в которой лежит проект пользователя. */
  cwd: string;
  /** Явный путь к конфигу (абсолютный или относительный к `cwd`). */
  configPath?: string | null | undefined;
}

const DEFAULT_CONFIG_FILES = ['minecms.config.ts', 'minecms.config.mts', 'minecms.config.js'];

/**
 * Дин динамически импортирует пользовательский `minecms.config.ts` и валидирует его.
 *
 * Сервер запускается через `tsx`, поэтому TS-файл импортируется напрямую.
 * Если файл не найден — возвращает `null` без ошибки: это легитимный сценарий
 * для свежей машины или для запуска сервера без пользовательских схем.
 *
 * Если файл найден, но содержимое не соответствует ожидаемому контракту,
 * бросаем явную ошибку с указанием пути — это однозначно ошибка разработчика.
 */
export async function loadUserConfig(
  options: LoadUserConfigOptions,
): Promise<LoadedUserConfig | null> {
  const path = resolveConfigPath(options);
  if (!path) return null;

  const url = pathToFileURL(path).href;
  const mod = (await import(url)) as { default?: unknown };
  const config = mod.default;

  if (!isConfigDefinition(config)) {
    throw new Error(
      `Конфиг ${path} должен экспортировать default — результат defineConfig({ database, schemas, server? }).`,
    );
  }

  validateUserSchemas(config.schemas);
  if (config.studioStructure !== undefined) {
    validateStudioStructure(config.schemas, config.studioStructure);
  }

  return { configPath: path, config, schemas: config.schemas };
}

function resolveConfigPath(options: LoadUserConfigOptions): string | null {
  if (options.configPath) {
    const abs = isAbsolute(options.configPath)
      ? options.configPath
      : resolve(options.cwd, options.configPath);
    if (!existsSync(abs)) {
      throw new Error(`Не найден файл конфига MineCMS: ${abs}`);
    }
    return abs;
  }

  for (const candidate of DEFAULT_CONFIG_FILES) {
    const abs = resolve(options.cwd, candidate);
    if (existsSync(abs)) return abs;
  }
  return null;
}

function isConfigDefinition(value: unknown): value is ConfigDefinition {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (!v.database || typeof v.database !== 'object') return false;
  if (!Array.isArray(v.schemas)) return false;
  return true;
}

/**
 * Дополнительная валидация схем за пределами `defineSchema`:
 * - имя не должно конфликтовать с системными таблицами;
 * - нет двух схем, которые после нормализации `name → snake_case` дают одно и то же имя.
 */
function validateUserSchemas(schemas: SchemaDefinition[]): void {
  const seenTableNames = new Map<string, string>();
  for (const schema of schemas) {
    const tableName = schemaToTableName(schema.name);
    if (RESERVED_TABLE_NAMES.has(tableName)) {
      throw new Error(`Имя схемы "${schema.name}" занято системой (${tableName}). Выбери другое.`);
    }
    const previous = seenTableNames.get(tableName);
    if (previous && previous !== schema.name) {
      throw new Error(
        `Схемы "${previous}" и "${schema.name}" нормализуются в одно имя таблицы "${tableName}".`,
      );
    }
    seenTableNames.set(tableName, schema.name);
  }
}
