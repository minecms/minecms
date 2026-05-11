/**
 * Локальное зеркало `SerializedField`/`SerializedSchema` из `apps/server`. В runtime
 * Studio получает эти структуры через `trpc.schemas.list`, тип выводится через AppRouter.
 * Этот файл — статическое описание фигуры, чтобы compile-time матчинг по `field.type`
 * работал без каста `as` в каждом потребителе.
 *
 * Единственный источник правды по семантике поля — server (`apps/server/src/schemas/serialize.ts`).
 * При изменении сериализации синхронизируй и здесь.
 */

export type SerializedField =
  | {
      type: 'string';
      label: string;
      optional: boolean;
      description?: string;
      min?: number;
      max?: number;
      pattern?: string;
    }
  | {
      type: 'text';
      label: string;
      optional: boolean;
      description?: string;
      min?: number;
      max?: number;
    }
  | {
      type: 'slug';
      label: string;
      optional: boolean;
      unique: boolean;
      description?: string;
      source?: string;
      max?: number;
    }
  | {
      type: 'number';
      label: string;
      optional: boolean;
      integer: boolean;
      description?: string;
      min?: number;
      max?: number;
    }
  | {
      type: 'boolean';
      label: string;
      optional: boolean;
      description?: string;
      default?: boolean;
    }
  | {
      type: 'richText';
      label: string;
      optional: boolean;
      description?: string;
      features?: string[];
    }
  | {
      type: 'image';
      label: string;
      optional: boolean;
      description?: string;
      accept?: string[];
    }
  | {
      type: 'reference';
      label: string;
      optional: boolean;
      description?: string;
      to: string[];
    }
  | {
      type: 'object';
      label: string;
      optional: boolean;
      description?: string;
      fields: Record<string, SerializedField>;
    }
  | {
      type: 'array';
      label: string;
      optional: boolean;
      description?: string;
      of: SerializedField;
      min?: number;
      max?: number;
    }
  | {
      type: 'union';
      label: string;
      optional: boolean;
      description?: string;
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

export interface SerializedSchema {
  name: string;
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
