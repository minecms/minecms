import { type ZodObject, type ZodType, z } from 'zod';
import type {
  ArrayField,
  FieldDefinition,
  ObjectField,
  ReferenceField,
  ScalarFieldDefinition,
  SchemaDefinition,
  UnionField,
} from './types';

/**
 * URL-safe slug: lowercase, цифры, дефис.
 * Не допускает дефис в начале/конце и подряд идущие дефисы.
 */
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Преобразует описание поля в Zod-валидатор.
 *
 * Если поле помечено `optional: true`, валидатор обернут в `.nullable()`.
 * Для вложенных типов (`object` / `array` / `union`) и `reference` строится рекурсивно.
 */
export function fieldToZod(field: FieldDefinition): ZodType {
  let schema: ZodType;
  if (isScalar(field)) {
    schema = scalarFieldToZod(field);
  } else if (field.type === 'reference') {
    schema = referenceFieldToZod(field);
  } else if (field.type === 'object') {
    schema = objectFieldToZod(field);
  } else if (field.type === 'array') {
    schema = arrayFieldToZod(field);
  } else {
    schema = unionFieldToZod(field);
  }

  if (field.optional === true) {
    return schema.nullable();
  }
  return schema;
}

/**
 * Преобразует схему сущности в Zod-объект для валидации документов.
 *
 * Полученный валидатор покрывает все поля схемы. Системные поля
 * (`id`, `createdAt`, `updatedAt`) не включаются — они управляются server-runtime.
 */
export function schemaToZod(schema: SchemaDefinition): ZodObject {
  const shape: Record<string, ZodType> = {};
  for (const [key, field] of Object.entries(schema.fields)) {
    shape[key] = fieldToZod(field);
  }
  return z.object(shape);
}

function isScalar(field: FieldDefinition): field is ScalarFieldDefinition {
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
 * Минимальная схема ProseMirror-узла. Для лимита глубины и защиты от циклов
 * Zod использует `z.lazy` — узлы вложены друг в друга через `content`.
 */
const richTextNodeSchema: ZodType = z.lazy(() =>
  z.object({
    type: z.string(),
    text: z.string().optional(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    marks: z
      .array(
        z.object({
          type: z.string(),
          attrs: z.record(z.string(), z.unknown()).optional(),
        }),
      )
      .optional(),
    content: z.array(richTextNodeSchema).optional(),
  }),
);

const richTextDocSchema = z.object({
  type: z.literal('doc'),
  content: z.array(richTextNodeSchema).optional(),
});

/**
 * Минимальная Zod-схема значения поля `image` в документе.
 *
 * `assetId` — id строки в системной таблице `media_assets`. Существование
 * записи проверяется на сервере отдельно (`findBrokenImage`), как и у
 * `reference`.
 */
const imageValueSchema = z.object({
  assetId: z.number().int().positive(),
  alt: z.string().max(500).optional(),
});

function scalarFieldToZod(field: ScalarFieldDefinition): ZodType {
  switch (field.type) {
    case 'string': {
      let s = z.string();
      if (field.min !== undefined) s = s.min(field.min);
      if (field.max !== undefined) s = s.max(field.max);
      if (field.pattern !== undefined) s = s.regex(field.pattern);
      return s;
    }
    case 'text': {
      let s = z.string();
      if (field.min !== undefined) s = s.min(field.min);
      if (field.max !== undefined) s = s.max(field.max);
      return s;
    }
    case 'slug': {
      let s = z.string().regex(SLUG_PATTERN, 'Invalid slug');
      if (field.max !== undefined) s = s.max(field.max);
      return s;
    }
    case 'number': {
      let n = z.number();
      if (field.integer === true) n = n.int();
      if (field.min !== undefined) n = n.min(field.min);
      if (field.max !== undefined) n = n.max(field.max);
      return n;
    }
    case 'boolean':
      return z.boolean();
    case 'richText':
      return richTextDocSchema;
    case 'image':
      return imageValueSchema;
  }
}

function referenceFieldToZod(_field: ReferenceField): ZodType {
  return z.number().int().positive();
}

function objectFieldToZod(field: ObjectField): ZodType {
  const shape: Record<string, ZodType> = {};
  for (const [key, sub] of Object.entries(field.fields)) {
    shape[key] = fieldToZod(sub);
  }
  return z.object(shape);
}

function arrayFieldToZod(field: ArrayField): ZodType {
  let arr = z.array(fieldToZod(field.of));
  if (field.min !== undefined) arr = arr.min(field.min);
  if (field.max !== undefined) arr = arr.max(field.max);
  return arr;
}

function unionFieldToZod(field: UnionField): ZodType {
  const discriminator = field.discriminator ?? 'kind';
  const variantKeys = Object.keys(field.variants);

  // biome-ignore lint/suspicious/noExplicitAny: Zod 4 discriminatedUnion требует кортеж объектов.
  const variants = variantKeys.map((key) => {
    const variant = field.variants[key];
    if (!variant) {
      throw new Error(`Union field "${field.label}": variant "${key}" is missing.`);
    }
    const shape: Record<string, ZodType> = {
      [discriminator]: z.literal(key),
    };
    for (const [subKey, subField] of Object.entries(variant.fields)) {
      shape[subKey] = fieldToZod(subField);
    }
    return z.object(shape);
  }) as any;

  if (variants.length < 2) {
    // Один вариант — discriminatedUnion бессмысленен; возвращаем сам объект.
    return variants[0] as ZodType;
  }
  return z.discriminatedUnion(discriminator, variants);
}
