import { Alert, AlertDescription, AlertTitle, Button, FieldGroup, Icon } from '@minecms/ui';
import { Loader2, Save } from '@minecms/ui/icons';
import { useForm, useStore } from '@tanstack/react-form';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { FieldInput, type SerializedSchema } from '../../entities/field-renderer';
import { buildFieldDefault } from '../../entities/field-renderer/defaults';
import { trpc } from '../../shared/api/client';

/**
 * Универсальная форма документа: рендерит `FieldInput` для каждого поля схемы,
 * сабмит — `documents.create` или `documents.update`. Семантика валидации:
 *
 * - На клиенте — мягкая проверка (required-поля, типы) через атрибуты HTML и
 *   локальный onSubmit-validator. Жёсткая валидация — на server через `schemaToZod`.
 * - Если server возвращает ошибку с issue по полю — показываем её под этим полем.
 *   Если общую — в Alert наверху формы.
 *
 * Для default-значений boolean-полей берётся `field.default`, иначе — `false`.
 * Для timestamps — пустые, server проставит сам.
 */
export interface DocumentEditFormProps {
  schema: SerializedSchema;
  initial?: Record<string, unknown>;
  documentId?: number;
}

export function DocumentEditForm(props: DocumentEditFormProps): React.JSX.Element {
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const isSingleton = props.schema.singleton;

  // После create на коллекции уводим на свежесозданный edit-URL —
  // дальше пользователь работает с update'ами этого же документа.
  // На singleton остаёмся на текущем URL: SingletonSchemaEditor сам
  // подхватит созданную запись через invalidate(documents.list).
  const createMutation = trpc.documents.create.useMutation({
    onSuccess: async (data) => {
      await utils.documents.list.invalidate({ schema: props.schema.name });
      await utils.documents.count.invalidate({ schema: props.schema.name });
      if (isSingleton) return;
      const newId = extractCreatedId(data);
      if (newId !== null) {
        await navigate({
          to: '/schema/$schemaName/$documentId',
          params: { schemaName: props.schema.name, documentId: String(newId) },
        });
      }
    },
  });
  // После update остаёмся на странице редактирования. Dirty-флаг сбрасывается
  // через `form.reset(value)` после await mutateAsync (см. onSubmit ниже).
  const updateMutation = trpc.documents.update.useMutation({
    onSuccess: async () => {
      await utils.documents.list.invalidate({ schema: props.schema.name });
      if (props.documentId !== undefined) {
        await utils.documents.get.invalidate({
          schema: props.schema.name,
          id: props.documentId,
        });
      }
    },
  });

  const isUpdate = props.documentId !== undefined;
  const mutation = isUpdate ? updateMutation : createMutation;

  const defaultValues = useMemo(
    () => buildDefaults(props.schema, props.initial),
    [props.schema, props.initial],
  );

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      // Guard от double-submit: если мутация уже летит (быстрый двойной клик
      // до того как React успел перерисовать disabled-кнопку) — игнорируем.
      if (mutation.isPending) return;
      if (isUpdate && props.documentId !== undefined) {
        await updateMutation.mutateAsync({
          schema: props.schema.name,
          id: props.documentId,
          data: value,
        });
        // Сохранённые значения становятся новой «pristine»-точкой формы:
        // кнопка «Сохранить» снова дисейблится, пока пользователь не правит дальше.
        form.reset(value);
      } else {
        await createMutation.mutateAsync({ schema: props.schema.name, data: value });
      }
    },
  });

  // Локальный флаг — единственный sync-источник правды для disabled-кнопки.
  // Выставляем `true` в submit-обработчике через flushSync ДО вызова
  // form.handleSubmit, чтобы React точно перерисовал disabled до старта
  // network-запроса (а не пропустил промежуточный render из-за batching).
  const [isSaving, setIsSaving] = useState(false);

  const isDirty = useStore(form.store, (state) => state.isDirty);
  // На update-форме (включая singleton) кнопка disabled пока нет изменений.
  // На create-форме — всегда enabled (можно сохранить документ с дефолтами).
  const saveBlockedByPristine = isUpdate && !isDirty;
  const saveDisabled = isSaving || mutation.isPending || saveBlockedByPristine;
  const showSaving = isSaving || mutation.isPending;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (saveDisabled) return;
    flushSync(() => setIsSaving(true));
    void form.handleSubmit().finally(() => setIsSaving(false));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <FieldGroup>
        {Object.entries(props.schema.fields).map(([fieldName, field]) => (
          <form.Field key={fieldName} name={fieldName}>
            {(fieldApi) => (
              <FieldInput
                name={fieldName}
                field={field}
                value={fieldApi.state.value}
                onChange={(next) => fieldApi.handleChange(next)}
                onBlur={fieldApi.handleBlur}
                {...(field.type === 'slug' && field.source
                  ? { sourceValue: pickString(form.state.values, field.source) }
                  : {})}
              />
            )}
          </form.Field>
        ))}
      </FieldGroup>

      {mutation.isError && (
        <Alert variant="destructive">
          <AlertTitle>Не удалось сохранить</AlertTitle>
          <AlertDescription>{mutation.error.message}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="submit" disabled={saveDisabled} aria-busy={showSaving}>
          {showSaving ? (
            <>
              <Icon icon={Loader2} className="animate-spin" /> Сохраняем…
            </>
          ) : (
            <>
              <Icon icon={Save} /> {isUpdate ? 'Сохранить' : 'Создать'}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

function buildDefaults(
  schema: SerializedSchema,
  initial: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(schema.fields)) {
    if (initial && Object.hasOwn(initial, name)) {
      defaults[name] = initial[name];
      continue;
    }
    defaults[name] = buildFieldDefault(field);
  }
  return defaults;
}

function pickString(values: Record<string, unknown>, key: string): string {
  const value = values[key];
  return typeof value === 'string' ? value : '';
}

/**
 * Достаёт id только что созданного документа из ответа `documents.create`.
 * Контракт server'а различается по драйверу: pg возвращает `{ ok, item: { id, ... } }`,
 * MySQL — `{ ok, id }`, dev-handler — `{ ok, item: { id, ... } }`. Поэтому пробуем
 * оба варианта и возвращаем `null`, если структура не распозналась.
 */
function extractCreatedId(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null;
  const root = data as { id?: unknown; item?: unknown };
  const direct = pickPositiveInt(root.id);
  if (direct !== null) return direct;
  if (root.item && typeof root.item === 'object') {
    return pickPositiveInt((root.item as { id?: unknown }).id);
  }
  return null;
}

function pickPositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}
