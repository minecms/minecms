/**
 * Облегчённое зеркало `SerializedSchema` из server для целей dev-режима.
 * В реальном режиме типы приходят через AppRouter, тут — собственная копия,
 * чтобы dev-mode не зависел от server-runtime.
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
    }
  | {
      type: 'reference';
      label: string;
      optional: boolean;
      description?: string;
      to: string[];
    }
  | {
      type: 'image';
      label: string;
      optional: boolean;
      description?: string;
      accept?: readonly string[];
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

/** Зеркало ответа `schemas.list` для панели сайдбара. */
export type SerializedStudioStructurePane = {
  title: string;
  items: Array<{ kind: 'divider' } | { kind: 'schema'; name: string }>;
};
