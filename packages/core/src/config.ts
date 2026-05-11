import { validateStudioStructure } from './studio-structure';
import type { ConfigDefinition } from './types';

/**
 * Корневой конфиг приложения MineCMS.
 *
 * Возвращает переданный объект с сохранением литеральных типов
 * (через `const`-параметр) и runtime-проверкой на дубликаты имён схем.
 *
 * @example
 * ```ts
 * import { defineConfig, defineSchema, defineField } from '@minecms/core';
 *
 * const page = defineSchema({
 *   name: 'page',
 *   fields: { title: defineField.string({ label: 'Title' }) },
 * });
 *
 * export default defineConfig({
 *   database: { driver: 'mysql' },
 *   schemas: [page],
 *   server: { port: 3333 },
 * });
 * ```
 *
 * Для фронта с `@minecms/sdk` список можно не дублировать вручную в объект —
 * см. `schemasToSdkMap` и единый массив схем в `schemas/index.ts`.
 */
export function defineConfig<const T extends ConfigDefinition>(config: T): T {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const schema of config.schemas) {
    if (seen.has(schema.name)) {
      dupes.add(schema.name);
    } else {
      seen.add(schema.name);
    }
  }
  if (dupes.size > 0) {
    throw new Error(`Duplicate schema names in config: ${[...dupes].join(', ')}`);
  }
  if (config.studioStructure !== undefined) {
    validateStudioStructure(config.schemas, config.studioStructure);
  }
  return config;
}
