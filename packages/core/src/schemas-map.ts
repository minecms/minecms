import type { SchemaDefinition } from './types';

/**
 * Карта схем для `createClient` из `@minecms/sdk`: ключи — `schema.name`, значения — сами схемы.
 * Выводится из кортежа без ручного дублирования имён.
 */
export type SdkSchemaMapFromList<T extends readonly SchemaDefinition[]> = {
  readonly [Item in T[number] as Item['name']]: Item;
};

/**
 * Собирает объект для опции `schemas` в `createClient`, из одного массива/кортежа схем.
 *
 * Ключи объекта всегда совпадают с `name` каждой схемы — тот же идентификатор, что в URL API.
 * В `minecms.config.ts` достаточно держать единый список (например `schemaTypes` в `schemas/index.ts`)
 * и передавать его и в `defineConfig({ schemas })`, и сюда.
 */
export function schemasToSdkMap<const T extends readonly SchemaDefinition[]>(
  list: T,
): SdkSchemaMapFromList<T> {
  const out: Record<string, SchemaDefinition> = {};
  for (const s of list) {
    if (out[s.name] !== undefined) {
      throw new Error(`schemasToSdkMap: duplicate schema name "${s.name}"`);
    }
    out[s.name] = s;
  }
  return out as SdkSchemaMapFromList<T>;
}
