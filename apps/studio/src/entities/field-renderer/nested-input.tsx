import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  Icon,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@minecms/ui';
import { ChevronDown, ChevronUp, Plus, Trash2 } from '@minecms/ui/icons';
import type { ReactNode } from 'react';
import { buildFieldDefault, buildUnionVariantDefault } from './defaults';
import type { SerializedField } from './types';

/**
 * Контейнер с отступом / рамкой / лейблом для вложенных полей.
 * Не зависит от типа — просто декорация, общая для object / array / union.
 */
function NestedShell(props: {
  htmlFor?: string;
  label: string;
  optional: boolean;
  error?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <Field data-invalid={props.error ? 'true' : undefined}>
      <FieldLabel htmlFor={props.htmlFor}>
        {props.label}
        {!props.optional && <span className="ml-1 text-destructive">*</span>}
      </FieldLabel>
      <div className="flex flex-col gap-3">{props.children}</div>
      {props.error ? <FieldError>{props.error}</FieldError> : null}
    </Field>
  );
}

/** Импорт `FieldInput` происходит через прокинутый `Renderer`, чтобы избежать
 * циклической зависимости. Конкретно — `field-input.tsx` импортирует этот файл. */
export type SubFieldRenderer = (props: {
  name: string;
  field: SerializedField;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
}) => React.JSX.Element;

export interface ObjectInputProps {
  field: Extract<SerializedField, { type: 'object' }>;
  name: string;
  value: Record<string, unknown> | null;
  onChange: (value: Record<string, unknown> | null) => void;
  Renderer: SubFieldRenderer;
  error?: string;
}

/** Вложенный объект. Под капотом — список FieldInput для каждого подполя. */
export function ObjectInput(props: ObjectInputProps): React.JSX.Element {
  const { field, name, value, onChange, Renderer, error } = props;
  const obj =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : (buildFieldDefault({ ...field, optional: false }) as Record<string, unknown>);

  return (
    <NestedShell label={field.label} optional={field.optional} {...(error ? { error } : {})}>
      {Object.entries(field.fields).map(([key, sub]) => (
        <Renderer
          key={key}
          name={`${name}.${key}`}
          field={sub}
          value={obj[key]}
          onChange={(next) => onChange({ ...obj, [key]: next })}
        />
      ))}
    </NestedShell>
  );
}

export interface ArrayInputProps {
  field: Extract<SerializedField, { type: 'array' }>;
  name: string;
  value: unknown[] | null;
  onChange: (value: unknown[] | null) => void;
  Renderer: SubFieldRenderer;
  error?: string;
}

/**
 * Управляемый массив элементов одного типа.
 * Поддерживает: добавление, удаление, перенос вверх/вниз; min/max сообщает в UI.
 */
export function ArrayInput(props: ArrayInputProps): React.JSX.Element {
  const { field, name, value, onChange, Renderer, error } = props;
  const items = Array.isArray(value) ? value : [];

  const canAdd = field.max === undefined || items.length < field.max;
  const canRemove = field.min === undefined || items.length > field.min;

  function move(idx: number, delta: number): void {
    const target = idx + delta;
    if (target < 0 || target >= items.length) return;
    const next = items.slice();
    const tmp = next[idx];
    next[idx] = next[target] as unknown;
    next[target] = tmp as unknown;
    onChange(next);
  }

  function update(idx: number, nextValue: unknown): void {
    const next = items.slice();
    next[idx] = nextValue;
    onChange(next);
  }

  function remove(idx: number): void {
    onChange(items.filter((_, i) => i !== idx));
  }

  function add(): void {
    onChange([...items, buildFieldDefault(field.of)]);
  }

  return (
    <NestedShell label={field.label} optional={field.optional} {...(error ? { error } : {})}>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Пусто. Нажми «Добавить», чтобы создать первый элемент.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item, idx) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: порядок задаёт пользователь, элементы без id.
            <li key={idx} className="rounded-md border bg-background p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground tabular-nums">
                  #{idx + 1}
                </span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    aria-label="Поднять выше"
                  >
                    <Icon icon={ChevronUp} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => move(idx, 1)}
                    disabled={idx === items.length - 1}
                    aria-label="Опустить ниже"
                  >
                    <Icon icon={ChevronDown} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(idx)}
                    disabled={!canRemove}
                    aria-label="Удалить элемент"
                  >
                    <Icon icon={Trash2} className="text-destructive" />
                  </Button>
                </div>
              </div>
              <Renderer
                name={`${name}[${idx}]`}
                field={field.of}
                value={item}
                onChange={(nextValue) => update(idx, nextValue)}
              />
            </li>
          ))}
        </ul>
      )}

      <div>
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={!canAdd}>
          <Icon icon={Plus} /> Добавить
        </Button>
      </div>
    </NestedShell>
  );
}

export interface UnionInputProps {
  field: Extract<SerializedField, { type: 'union' }>;
  name: string;
  value: Record<string, unknown> | null;
  onChange: (value: Record<string, unknown> | null) => void;
  Renderer: SubFieldRenderer;
  error?: string;
}

/**
 * Дискриминируемый союз. Селектор типа сверху + поля выбранного варианта ниже.
 * При смене варианта значение пересоздаётся из дефолтов нового варианта —
 * совпадающие имена полей могут потерять значения; это сознательное упрощение.
 */
export function UnionInput(props: UnionInputProps): React.JSX.Element {
  const { field, name, value, onChange, Renderer, error } = props;

  const variantKeys = Object.keys(field.variants);
  const currentKey =
    value && typeof value === 'object' && typeof value[field.discriminator] === 'string'
      ? (value[field.discriminator] as string)
      : (variantKeys[0] ?? '');
  const variant = field.variants[currentKey];

  const obj =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : buildUnionVariantDefault(field, currentKey);

  function changeVariant(nextKey: string): void {
    onChange(buildUnionVariantDefault(field, nextKey));
  }

  function updateField(key: string, next: unknown): void {
    onChange({ ...obj, [key]: next });
  }

  return (
    <NestedShell label={field.label} optional={field.optional} {...(error ? { error } : {})}>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Тип</span>
        <Select value={currentKey} onValueChange={changeVariant}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {variantKeys.map((key) => (
              <SelectItem key={key} value={key}>
                {field.variants[key]?.label ?? key}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {variant ? (
        <div className="flex flex-col gap-3">
          {Object.entries(variant.fields).map(([key, sub]) => (
            <Renderer
              key={key}
              name={`${name}.${key}`}
              field={sub}
              value={obj[key]}
              onChange={(next) => updateField(key, next)}
            />
          ))}
        </div>
      ) : null}
    </NestedShell>
  );
}
