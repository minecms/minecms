import type { SerializedField } from './types';

/**
 * Возвращает «пустое» значение для поля. Используется при создании нового
 * элемента массива, объявлении дефолтов формы и при переключении union-варианта.
 *
 * Семантика:
 * - `optional` поля → `null`
 * - `boolean` → `default ?? false`
 * - `number` → `0`
 * - `string` / `text` / `slug` → `''`
 * - `reference` → `null` (даже если поле обязательное — id может быть выбран позже,
 *   а pull-через-required приходит уже на сабмите формы)
 * - `object` → объект из дефолтов всех полей
 * - `array` → пустой массив
 * - `union` → объект первого варианта с `kind: '<первый ключ>'`
 */
export function buildFieldDefault(field: SerializedField): unknown {
  if (field.optional) return null;

  switch (field.type) {
    case 'boolean':
      return field.default ?? false;
    case 'number':
      return 0;
    case 'string':
    case 'text':
    case 'slug':
      return '';
    case 'richText':
      // Пустой ProseMirror-документ с одним пустым параграфом — TipTap ожидает
      // именно такой стартовый стейт, иначе курсор негде поставить.
      return { type: 'doc', content: [{ type: 'paragraph' }] };
    case 'reference':
      return null;
    case 'image':
      // image — даже у required-поля стартуем с null: пользователь нажмёт
      // Upload/Select, и форма получит реальный объект только после выбора.
      return null;
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const [key, sub] of Object.entries(field.fields)) {
        out[key] = buildFieldDefault(sub);
      }
      return out;
    }
    case 'array':
      return [];
    case 'union': {
      const variantKeys = Object.keys(field.variants);
      const first = variantKeys[0];
      if (!first) return null;
      return buildUnionVariantDefault(field, first);
    }
  }
}

/** Дефолт для конкретного варианта union — добавляет `discriminator: <key>`. */
export function buildUnionVariantDefault(
  field: Extract<SerializedField, { type: 'union' }>,
  variantKey: string,
): Record<string, unknown> {
  const variant = field.variants[variantKey];
  if (!variant) return { [field.discriminator]: variantKey };
  const out: Record<string, unknown> = { [field.discriminator]: variantKey };
  for (const [key, sub] of Object.entries(variant.fields)) {
    out[key] = buildFieldDefault(sub);
  }
  return out;
}
