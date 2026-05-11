import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@minecms/ui';
import { useEffect, useState } from 'react';
import { trpc } from '../../shared/api/client';
import type { SerializedField } from './types';

/**
 * Picker для `reference`-поля. Принимает id целевого документа (или `null`)
 * и список допустимых схем `to`.
 *
 * Стратегия:
 * - Если `to.length === 1`, показывается один Select со списком документов этой схемы.
 * - Если `to.length > 1`, дополнительно показывается Select для выбора схемы.
 *
 * Документы загружаются через `trpc.documents.list` (limit 200; больше — Phase 12+).
 * Label элемента — первое из существующих полей: `title`, `name`, `label`, `slug`,
 * иначе `#id`.
 */
export interface ReferencePickerProps {
  field: Extract<SerializedField, { type: 'reference' }>;
  name: string;
  value: number | null;
  onChange: (value: number | null) => void;
  error?: string;
}

const PICKER_LIMIT = 200;

export function ReferencePicker(props: ReferencePickerProps): React.JSX.Element {
  const { field, name, value, onChange, error } = props;
  const id = `field-${name}`;

  const [activeSchema, setActiveSchema] = useState<string>(() => field.to[0] ?? '');

  useEffect(() => {
    if (!field.to.includes(activeSchema)) {
      setActiveSchema(field.to[0] ?? '');
    }
  }, [field.to, activeSchema]);

  const list = trpc.documents.list.useQuery(
    { schema: activeSchema, limit: PICKER_LIMIT, offset: 0 },
    { enabled: activeSchema.length > 0 },
  );

  const items = list.data?.items ?? [];
  const stringValue = value === null || value === undefined ? '' : String(value);

  return (
    <Field data-invalid={error ? 'true' : undefined}>
      <FieldLabel htmlFor={id}>
        {field.label}
        {!field.optional && <span className="ml-1 text-destructive">*</span>}
      </FieldLabel>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {field.to.length > 1 ? (
          <Select value={activeSchema} onValueChange={setActiveSchema}>
            <SelectTrigger className="sm:w-48" aria-label="Тип документа">
              <SelectValue placeholder="Тип" />
            </SelectTrigger>
            <SelectContent>
              {field.to.map((schemaName) => (
                <SelectItem key={schemaName} value={schemaName}>
                  {schemaName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <Select
          value={stringValue}
          onValueChange={(next) => {
            const num = Number(next);
            onChange(Number.isFinite(num) && num > 0 ? num : null);
          }}
          disabled={list.isLoading || items.length === 0}
        >
          <SelectTrigger id={id} className="flex-1">
            <SelectValue
              placeholder={
                list.isLoading
                  ? 'Загрузка…'
                  : items.length === 0
                    ? `Документов в «${activeSchema}» пока нет`
                    : 'Выбери документ'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {items.map((row) => {
              const itemId = (row as Record<string, unknown>).id;
              const numericId = typeof itemId === 'number' ? itemId : Number(itemId);
              if (!Number.isFinite(numericId)) return null;
              return (
                <SelectItem key={numericId} value={String(numericId)}>
                  {pickReferenceLabel(row as Record<string, unknown>, numericId)}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <FieldError>{error}</FieldError>
      ) : field.description ? (
        <FieldDescription>{field.description}</FieldDescription>
      ) : (
        <FieldDescription>
          Ссылается на документ из {field.to.map((s) => `«${s}»`).join(', ')}.
        </FieldDescription>
      )}
    </Field>
  );
}

/** Подбирает наиболее «человеческое» поле для отображения документа в Select. */
function pickReferenceLabel(row: Record<string, unknown>, id: number): string {
  for (const key of ['title', 'name', 'label', 'slug']) {
    const v = row[key];
    if (typeof v === 'string' && v.trim().length > 0) return v;
  }
  return `#${id}`;
}
