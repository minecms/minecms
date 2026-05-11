import type { FieldDefinition, SchemaDefinition } from '@minecms/core';

/** Поле в JSON-форме, пригодной для передачи в Studio через tRPC. */
export type SerializedField =
  | {
      type: 'string';
      label: string;
      description?: string;
      optional: boolean;
      min?: number;
      max?: number;
      pattern?: string;
    }
  | {
      type: 'text';
      label: string;
      description?: string;
      optional: boolean;
      min?: number;
      max?: number;
    }
  | {
      type: 'slug';
      label: string;
      description?: string;
      optional: boolean;
      source?: string;
      unique: boolean;
      max?: number;
    }
  | {
      type: 'number';
      label: string;
      description?: string;
      optional: boolean;
      integer: boolean;
      min?: number;
      max?: number;
    }
  | {
      type: 'boolean';
      label: string;
      description?: string;
      optional: boolean;
      default?: boolean;
    }
  | {
      type: 'richText';
      label: string;
      description?: string;
      optional: boolean;
      features?: string[];
    }
  | {
      type: 'image';
      label: string;
      description?: string;
      optional: boolean;
      accept?: string[];
    }
  | {
      type: 'reference';
      label: string;
      description?: string;
      optional: boolean;
      to: string[];
    }
  | {
      type: 'object';
      label: string;
      description?: string;
      optional: boolean;
      fields: Record<string, SerializedField>;
    }
  | {
      type: 'array';
      label: string;
      description?: string;
      optional: boolean;
      of: SerializedField;
      min?: number;
      max?: number;
    }
  | {
      type: 'union';
      label: string;
      description?: string;
      optional: boolean;
      discriminator: string;
      variants: Record<
        string,
        {
          label: string;
          description?: string;
          fields: Record<string, SerializedField>;
        }
      >;
    };

/** Схема в JSON-форме. */
export interface SerializedSchema {
  name: string;
  /** Логический тип документа в API (поле `type`); обычно совпадает с `name`. */
  type: string;
  pluralName: string;
  label: string;
  icon: string | null;
  order: number;
  singleton: boolean;
  routeField: string | null;
  timestamps: boolean;
  fields: Record<string, SerializedField>;
}

/**
 * Превращает `SchemaDefinition` (с потенциальным `RegExp` в `pattern`) в plain JSON,
 * пригодный для tRPC-ответа и потребления Studio.
 */
export function serializeSchema(schema: SchemaDefinition): SerializedSchema {
  const fields: Record<string, SerializedField> = {};
  for (const [key, field] of Object.entries(schema.fields)) {
    fields[key] = serializeField(field);
  }
  return {
    name: schema.name,
    type: schema.type ?? schema.name,
    pluralName: schema.pluralName ?? `${schema.name}s`,
    label: schema.label ?? schema.name,
    icon: schema.icon ?? null,
    order: schema.order ?? 0,
    singleton: schema.singleton === true,
    routeField: (schema.routeField as string | undefined) ?? null,
    timestamps: schema.timestamps !== false,
    fields,
  };
}

export function serializeField(field: FieldDefinition): SerializedField {
  const base = {
    label: field.label,
    optional: field.optional === true,
    ...(field.description !== undefined ? { description: field.description } : {}),
  };
  switch (field.type) {
    case 'string':
      return {
        type: 'string',
        ...base,
        ...(field.min !== undefined ? { min: field.min } : {}),
        ...(field.max !== undefined ? { max: field.max } : {}),
        ...(field.pattern !== undefined ? { pattern: field.pattern.source } : {}),
      };
    case 'text':
      return {
        type: 'text',
        ...base,
        ...(field.min !== undefined ? { min: field.min } : {}),
        ...(field.max !== undefined ? { max: field.max } : {}),
      };
    case 'slug':
      return {
        type: 'slug',
        ...base,
        unique: field.unique !== false,
        ...(field.source !== undefined ? { source: field.source } : {}),
        ...(field.max !== undefined ? { max: field.max } : {}),
      };
    case 'number':
      return {
        type: 'number',
        ...base,
        integer: field.integer === true,
        ...(field.min !== undefined ? { min: field.min } : {}),
        ...(field.max !== undefined ? { max: field.max } : {}),
      };
    case 'boolean':
      return {
        type: 'boolean',
        ...base,
        ...(field.default !== undefined ? { default: field.default } : {}),
      };
    case 'richText':
      return {
        type: 'richText',
        ...base,
        ...(field.features !== undefined ? { features: [...field.features] } : {}),
      };
    case 'image':
      return {
        type: 'image',
        ...base,
        ...(field.accept !== undefined ? { accept: [...field.accept] } : {}),
      };
    case 'reference':
      return {
        type: 'reference',
        ...base,
        to: [...field.to],
      };
    case 'object': {
      const subFields: Record<string, SerializedField> = {};
      for (const [key, sub] of Object.entries(field.fields)) {
        subFields[key] = serializeField(sub);
      }
      return { type: 'object', ...base, fields: subFields };
    }
    case 'array':
      return {
        type: 'array',
        ...base,
        of: serializeField(field.of),
        ...(field.min !== undefined ? { min: field.min } : {}),
        ...(field.max !== undefined ? { max: field.max } : {}),
      };
    case 'union': {
      const variants: Record<
        string,
        { label: string; description?: string; fields: Record<string, SerializedField> }
      > = {};
      for (const [key, variant] of Object.entries(field.variants)) {
        const variantFields: Record<string, SerializedField> = {};
        for (const [subKey, sub] of Object.entries(variant.fields)) {
          variantFields[subKey] = serializeField(sub);
        }
        variants[key] = {
          label: variant.label,
          ...(variant.description !== undefined ? { description: variant.description } : {}),
          fields: variantFields,
        };
      }
      return {
        type: 'union',
        ...base,
        discriminator: field.discriminator ?? 'kind',
        variants,
      };
    }
  }
}
