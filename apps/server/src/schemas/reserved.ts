/**
 * Имена таблиц, занятые системой. Если пользователь объявит схему с таким именем,
 * loader падает на этапе валидации — иначе при автомиграции мы либо снесём
 * системную таблицу, либо получим конфликт ON CREATE.
 */
export const RESERVED_TABLE_NAMES = new Set<string>([
  'users',
  'sessions',
  'system_state',
  'media_assets',
  'schema_migrations',
  '__drizzle_migrations',
]);

/**
 * Нормализует имя схемы в SQL-идентификатор: заменяет `-` на `_` и приводит к нижнему регистру.
 * `defineSchema` уже валидирует общий формат `[a-z][a-z0-9_-]*`, здесь только `-` → `_`.
 */
export function schemaToTableName(schemaName: string): string {
  return schemaName.replace(/-/g, '_').toLowerCase();
}
