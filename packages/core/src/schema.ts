import type { FieldDefinition, SchemaDefinition } from './types';

/**
 * Допустимое имя схемы — kebab-case или snake_case ASCII, начинается с буквы.
 * Используется как идентификатор в URL и в именах таблиц БД.
 */
const SCHEMA_NAME_PATTERN = /^[a-z][a-z0-9_-]*$/;

/**
 * Описывает контент-модель MineCMS.
 *
 * Возвращает переданный объект «как есть» — но с сохранением литеральных типов
 * через `const`-параметр, что критично для `InferSchemaType<typeof schema>`.
 *
 * Выполняет минимальные runtime-проверки, чтобы поймать опечатки сразу:
 * - задано `name` и/или `type` (хотя бы одно), строка проходит `^[a-z][a-z0-9_-]*$`;
 *   если оба заданы — должны совпадать;
 * - в схеме хотя бы одно поле;
 * - если указан `routeField`, он есть среди полей.
 *
 * @example
 * ```ts
 * const page = defineSchema({
 *   name: 'page',
 *   label: 'Страница',
 *   fields: {
 *     title: defineField.string({ label: 'Заголовок' }),
 *     slug: defineField.slug({ label: 'Slug', source: 'title' }),
 *   },
 *   routeField: 'slug',
 * });
 *
 * const home = defineSchema({
 *   type: 'home',
 *   label: 'Главная',
 *   singleton: true,
 *   fields: { title: defineField.string({ label: 'Заголовок' }) },
 * });
 * ```
 */
export function defineSchema<
  const F extends Record<string, FieldDefinition>,
  const S extends Omit<SchemaDefinition<F>, 'name' | 'type' | 'fields'> & {
    fields: F;
    name?: string;
    type?: string;
  },
>(definition: S): S & { name: string; type?: string } {
  const raw = definition as { name?: string; type?: string };
  const name = raw.name ?? raw.type;
  if (!name || !SCHEMA_NAME_PATTERN.test(name)) {
    throw new Error(
      `Schema must have a valid name or type (lowercase ASCII letters, digits, "-", "_", starts with a letter).`,
    );
  }
  if (raw.name !== undefined && raw.type !== undefined && raw.name !== raw.type) {
    throw new Error(`Schema name "${raw.name}" and type "${raw.type}" must be the same.`);
  }

  if (Object.keys(definition.fields).length === 0) {
    throw new Error(`Schema "${name}" must have at least one field.`);
  }

  if (definition.routeField !== undefined) {
    const routeKey = definition.routeField as string;
    if (!(routeKey in definition.fields)) {
      throw new Error(
        `Schema "${name}" has routeField "${routeKey}" that is not defined in fields.`,
      );
    }
  }

  return {
    ...(definition as object),
    name,
    type: raw.type ?? raw.name ?? name,
  } as S & { name: string; type?: string };
}
