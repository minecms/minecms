import type {
  ArrayField,
  BooleanField,
  FieldDefinition,
  ImageField,
  NumberField,
  ObjectField,
  ReferenceField,
  RichTextField,
  ScalarFieldDefinition,
  SlugField,
  StringField,
  TextField,
  UnionField,
} from './types';

type StringFieldInput = Omit<StringField, 'type'>;
type TextFieldInput = Omit<TextField, 'type'>;
type SlugFieldInput = Omit<SlugField, 'type'>;
type NumberFieldInput = Omit<NumberField, 'type'>;
type BooleanFieldInput = Omit<BooleanField, 'type'>;
type RichTextFieldInput = Omit<RichTextField, 'type'>;
type ImageFieldInput = Omit<ImageField, 'type'>;
type ReferenceFieldInput = Omit<ReferenceField, 'type'>;
type ObjectFieldInput<F extends Record<string, FieldDefinition>> = Omit<
  ObjectField,
  'type' | 'fields'
> & {
  fields: F;
};
type ArrayFieldInput<I extends ArrayField['of']> = Omit<ArrayField, 'type' | 'of'> & { of: I };
type UnionFieldInput<V extends Record<string, ObjectField>> = Omit<
  UnionField,
  'type' | 'variants'
> & {
  variants: V;
};

/**
 * Типизированные конструкторы полей для `defineSchema`.
 *
 * Возвращают объект-описание поля с гарантированно литеральным `type`.
 * Используется как фабрика — рантайм-логика отсутствует, кроме
 * присвоения тега `type` и (для `union`) дефолтного дискриминатора.
 *
 * @example
 * ```ts
 * defineField.string({ label: 'Заголовок', max: 200 });
 * defineField.array({
 *   label: 'Пункты меню',
 *   of: defineField.union({
 *     label: 'Пункт',
 *     variants: {
 *       link: defineField.object({
 *         label: 'Внешняя ссылка',
 *         fields: {
 *           title: defineField.string({ label: 'Текст' }),
 *           url: defineField.string({ label: 'URL' }),
 *         },
 *       }),
 *     },
 *   }),
 * });
 * ```
 */
export const defineField = {
  string<const O extends StringFieldInput>(options: O): O & { type: 'string' } {
    return { ...options, type: 'string' };
  },
  text<const O extends TextFieldInput>(options: O): O & { type: 'text' } {
    return { ...options, type: 'text' };
  },
  slug<const O extends SlugFieldInput>(options: O): O & { type: 'slug' } {
    return { ...options, type: 'slug' };
  },
  number<const O extends NumberFieldInput>(options: O): O & { type: 'number' } {
    return { ...options, type: 'number' };
  },
  boolean<const O extends BooleanFieldInput>(options: O): O & { type: 'boolean' } {
    return { ...options, type: 'boolean' };
  },
  richText<const O extends RichTextFieldInput>(options: O): O & { type: 'richText' } {
    return { ...options, type: 'richText' };
  },
  image<const O extends ImageFieldInput>(options: O): O & { type: 'image' } {
    return { ...options, type: 'image' };
  },
  reference<const O extends ReferenceFieldInput>(options: O): O & { type: 'reference' } {
    if (!Array.isArray(options.to) || options.to.length === 0) {
      throw new Error('defineField.reference: "to" must be a non-empty array of schema names.');
    }
    return { ...options, type: 'reference' };
  },
  object<const F extends Record<string, FieldDefinition>, const O extends ObjectFieldInput<F>>(
    options: O,
  ): O & { type: 'object' } {
    if (Object.keys(options.fields).length === 0) {
      throw new Error('defineField.object: "fields" must contain at least one field.');
    }
    return { ...options, type: 'object' };
  },
  array<const I extends ArrayField['of'], const O extends ArrayFieldInput<I>>(
    options: O,
  ): O & { type: 'array' } {
    return { ...options, type: 'array' };
  },
  union<const V extends Record<string, ObjectField>, const O extends UnionFieldInput<V>>(
    options: O,
  ): O & { type: 'union'; discriminator: string } {
    const variantKeys = Object.keys(options.variants);
    if (variantKeys.length < 2) {
      throw new Error('defineField.union: needs at least 2 variants.');
    }
    const discriminator = options.discriminator ?? 'kind';
    for (const key of variantKeys) {
      const fieldsOfVariant = options.variants[key]?.fields;
      if (fieldsOfVariant && discriminator in fieldsOfVariant) {
        throw new Error(
          `defineField.union: variant "${key}" must not declare field "${discriminator}" — it is the discriminator and is added automatically.`,
        );
      }
    }
    return { ...options, type: 'union', discriminator };
  },
};

/**
 * Type-guard: проверяет, что описание поля — скаляр.
 * Полезно в местах, где нужно отделить вложенные структуры от хранимых в SQL «как есть».
 */
export function isScalarField(field: FieldDefinition): field is ScalarFieldDefinition {
  return (
    field.type === 'string' ||
    field.type === 'text' ||
    field.type === 'slug' ||
    field.type === 'number' ||
    field.type === 'boolean' ||
    field.type === 'richText' ||
    field.type === 'image'
  );
}

/**
 * Type-guard: вложенная или ссылочная структура (всё, что не скаляр).
 * Сервер использует это, чтобы решить, какую SQL-колонку выделить — JSON или bigint.
 */
export function isNestedField(
  field: FieldDefinition,
): field is ObjectField | ArrayField | UnionField | ReferenceField {
  return !isScalarField(field);
}
