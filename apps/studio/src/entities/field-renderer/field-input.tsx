import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Switch,
  Textarea,
} from '@minecms/ui';
import { useEffect, useRef } from 'react';
import { ImageInput } from './image-input';
import { ArrayInput, ObjectInput, UnionInput } from './nested-input';
import { ReferencePicker } from './reference-picker';
import { RichTextInput } from './rich-text-input';
import { slugify } from './slugify';
import type { SerializedField } from './types';

/**
 * Универсальный input для одного поля схемы.
 *
 * Скаляры (string / text / slug / number / boolean) рендерятся встроенными
 * компонентами; вложенные структуры (object / array / union) и `reference`
 * делегируются в `nested-input.tsx` и `reference-picker.tsx`.
 *
 * Контракт:
 * - `value` приходит из формы, может быть скаляром, объектом, массивом или `null`.
 * - `onChange` принимает значение того же типа, что ожидает поле.
 * - `error` — текст ошибки от валидатора формы (TanStack Form/Zod).
 * - `sourceValue` — если поле `slug` и у него есть `source`, передаётся текущее
 *   значение source-поля для генерации slug при пустом значении.
 */
export interface FieldInputProps {
  name: string;
  field: SerializedField;
  value: unknown;
  onChange: (value: unknown) => void;
  onBlur?: () => void;
  error?: string;
  sourceValue?: string;
}

export function FieldInput(props: FieldInputProps): React.JSX.Element {
  const { name, field, value, onChange, onBlur, error, sourceValue } = props;
  const id = `field-${name}`;
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (field.type !== 'slug') return;
    if (dirtyRef.current) return;
    if (typeof value === 'string' && value.trim().length > 0) return;
    if (!sourceValue) return;
    onChange(slugify(sourceValue));
  }, [field.type, sourceValue, value, onChange]);

  if (field.type === 'reference') {
    return (
      <ReferencePicker
        field={field}
        name={name}
        value={typeof value === 'number' ? value : value === null ? null : null}
        onChange={(next) => onChange(next)}
        {...(error ? { error } : {})}
      />
    );
  }

  if (field.type === 'richText') {
    return (
      <RichTextInput
        field={field}
        name={name}
        value={value}
        onChange={(next) => onChange(next)}
        {...(onBlur ? { onBlur } : {})}
        {...(error ? { error } : {})}
      />
    );
  }

  if (field.type === 'image') {
    const imageValue =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as { assetId?: unknown; alt?: unknown })
        : null;
    const normalized =
      imageValue && typeof imageValue.assetId === 'number' && imageValue.assetId > 0
        ? {
            assetId: imageValue.assetId,
            ...(typeof imageValue.alt === 'string' ? { alt: imageValue.alt } : {}),
          }
        : null;
    return (
      <ImageInput
        field={field}
        name={name}
        value={normalized}
        onChange={(next) => onChange(next)}
        {...(onBlur ? { onBlur } : {})}
        {...(error ? { error } : {})}
      />
    );
  }

  if (field.type === 'object') {
    return (
      <ObjectInput
        field={field}
        name={name}
        value={
          value && typeof value === 'object' && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : null
        }
        onChange={(next) => onChange(next)}
        Renderer={FieldInput}
        {...(error ? { error } : {})}
      />
    );
  }

  if (field.type === 'array') {
    return (
      <ArrayInput
        field={field}
        name={name}
        value={Array.isArray(value) ? value : null}
        onChange={(next) => onChange(next)}
        Renderer={FieldInput}
        {...(error ? { error } : {})}
      />
    );
  }

  if (field.type === 'union') {
    return (
      <UnionInput
        field={field}
        name={name}
        value={
          value && typeof value === 'object' && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : null
        }
        onChange={(next) => onChange(next)}
        Renderer={FieldInput}
        {...(error ? { error } : {})}
      />
    );
  }

  if (field.type === 'boolean') {
    return (
      <Field data-invalid={error ? 'true' : undefined}>
        <div className="flex items-start gap-3">
          <Switch
            id={id}
            checked={value === true}
            onCheckedChange={(next) => onChange(next)}
            className="mt-1"
          />
          <div className="flex flex-1 flex-col gap-0.5">
            <FieldLabel htmlFor={id}>
              {field.label}
              {!field.optional && <span className="ml-1 text-destructive">*</span>}
            </FieldLabel>
            {field.description && <FieldDescription>{field.description}</FieldDescription>}
            {error && <FieldError>{error}</FieldError>}
          </div>
        </div>
      </Field>
    );
  }

  return (
    <Field data-invalid={error ? 'true' : undefined}>
      <FieldLabel htmlFor={id}>
        {field.label}
        {!field.optional && <span className="ml-1 text-destructive">*</span>}
      </FieldLabel>
      {field.type === 'text' ? (
        <Textarea
          id={id}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.currentTarget.value)}
          onBlur={onBlur}
          rows={4}
          required={!field.optional}
          {...(field.min !== undefined ? { minLength: field.min } : {})}
          {...(field.max !== undefined ? { maxLength: field.max } : {})}
        />
      ) : field.type === 'number' ? (
        <Input
          id={id}
          type="number"
          inputMode={field.integer ? 'numeric' : 'decimal'}
          step={field.integer ? 1 : 'any'}
          value={
            typeof value === 'number' ? String(value) : value === null ? '' : String(value ?? '')
          }
          onChange={(event) => {
            const raw = event.currentTarget.value;
            if (raw === '') {
              onChange(field.optional ? null : undefined);
              return;
            }
            const parsed = Number(raw);
            onChange(Number.isNaN(parsed) ? raw : parsed);
          }}
          onBlur={onBlur}
          required={!field.optional}
          {...(field.min !== undefined ? { min: field.min } : {})}
          {...(field.max !== undefined ? { max: field.max } : {})}
        />
      ) : (
        <Input
          id={id}
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => {
            if (field.type === 'slug') dirtyRef.current = true;
            onChange(
              field.type === 'slug'
                ? slugify(event.currentTarget.value)
                : event.currentTarget.value,
            );
          }}
          onBlur={onBlur}
          required={!field.optional}
          spellCheck={field.type !== 'slug'}
          autoComplete="off"
          {...(field.type === 'string' && field.min !== undefined ? { minLength: field.min } : {})}
          {...(field.type === 'string' && field.max !== undefined ? { maxLength: field.max } : {})}
          {...(field.type === 'slug' && field.max !== undefined ? { maxLength: field.max } : {})}
          {...(field.type === 'string' && field.pattern !== undefined
            ? { pattern: field.pattern }
            : {})}
        />
      )}
      {error ? (
        <FieldError>{error}</FieldError>
      ) : field.description ? (
        <FieldDescription>{field.description}</FieldDescription>
      ) : field.type === 'slug' && field.source ? (
        <FieldDescription>
          Генерируется автоматически из поля «{field.source}». Можно отредактировать.
        </FieldDescription>
      ) : null}
    </Field>
  );
}
