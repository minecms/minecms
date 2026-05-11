import { Button, Field, FieldDescription, FieldError, FieldLabel, Icon, Input } from '@minecms/ui';
import { ImageIcon, Search, Trash2, Upload } from '@minecms/ui/icons';
import { useId, useRef, useState } from 'react';
import { type MediaAsset, uploadMediaFile } from '../../entities/media';
import { trpc } from '../../shared/api/client';
import { MediaPickerDialog } from '../../widgets/media-picker/media-picker-dialog';
import type { SerializedField } from './types';

interface ImageFieldShape extends Extract<SerializedField, { type: 'image' }> {}

export interface ImageInputProps {
  name: string;
  field: ImageFieldShape;
  value: { assetId: number; alt?: string } | null;
  onChange: (next: { assetId: number; alt?: string } | null) => void;
  onBlur?: () => void;
  error?: string;
}

/**
 * Поле «изображение» с UI как у Sanity:
 *
 * - Когда значение пустое — пунктирная рамка-dropzone с подписью «Drag or paste
 *   image here» и двумя кнопками `Upload` / `Select`.
 * - Когда выбрано — превью + редактирование `alt` + кнопка «Удалить».
 *
 * Загрузка идёт через `entities/media/upload.ts` (POST multipart). Выбор —
 * через `MediaPickerDialog`. Загруженный/выбранный ассет кладётся в форму
 * как `{ assetId, alt? }` — этот формат хранит и `defineField.image`.
 */
export function ImageInput(props: ImageInputProps): React.JSX.Element {
  const { name, field, value, onChange, onBlur, error } = props;
  const id = `field-${name}`;
  const altInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const assetQuery = trpc.media.get.useQuery(
    { id: value?.assetId ?? 0 },
    { enabled: typeof value?.assetId === 'number' && value.assetId > 0 },
  );
  const asset = assetQuery.data?.item as unknown as MediaAsset | undefined;

  const accept = field.accept && field.accept.length > 0 ? field.accept.join(',') : 'image/*';

  async function uploadFile(file: File): Promise<void> {
    setUploadError(null);
    setUploading(true);
    try {
      const { asset: created } = await uploadMediaFile(file);
      onChange({ assetId: created.id });
      onBlur?.();
    } catch (err) {
      setUploadError((err as Error).message ?? 'Не удалось загрузить файл.');
    } finally {
      setUploading(false);
    }
  }

  function handleSelect(picked: MediaAsset): void {
    const next: { assetId: number; alt?: string } = { assetId: picked.id };
    if (value?.alt) next.alt = value.alt;
    onChange(next);
    onBlur?.();
  }

  function handleClear(): void {
    onChange(null);
    onBlur?.();
  }

  function setAlt(next: string): void {
    if (!value) return;
    if (next.length === 0) {
      const without = { ...value };
      delete (without as { alt?: string }).alt;
      onChange({ assetId: value.assetId });
      return;
    }
    onChange({ assetId: value.assetId, alt: next });
  }

  return (
    <Field data-invalid={error ? 'true' : undefined}>
      <FieldLabel htmlFor={id}>
        {field.label}
        {!field.optional && <span className="ml-1 text-destructive">*</span>}
      </FieldLabel>

      {value && asset ? (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start">
            <div className="relative size-32 shrink-0 overflow-hidden rounded-md bg-muted">
              {asset.viewUrl ? (
                <img
                  src={asset.viewUrl}
                  alt={value.alt ?? asset.alt ?? asset.originalFilename}
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  <Icon icon={ImageIcon} />
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium">{asset.originalFilename}</p>
                <p className="text-xs text-muted-foreground">
                  {asset.mimeType}
                  {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ''}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor={altInputId} className="text-xs text-muted-foreground">
                  Alt-текст (для доступности и SEO)
                </FieldLabel>
                <Input
                  id={altInputId}
                  value={value.alt ?? ''}
                  onChange={(event) => setAlt(event.currentTarget.value)}
                  onBlur={onBlur}
                  maxLength={500}
                  placeholder="Например: Команда на встрече в офисе"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPickerOpen(true)}
                >
                  <Icon icon={Search} /> Заменить
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleClear}>
                  <Icon icon={Trash2} /> Убрать
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <section
          id={id}
          aria-label="Зона загрузки изображения"
          onDragEnter={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragOver(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragOver(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragOver(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragOver(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void uploadFile(file);
          }}
          onPaste={(event) => {
            const file = Array.from(event.clipboardData?.files ?? [])[0];
            if (file) {
              event.preventDefault();
              void uploadFile(file);
            }
          }}
          className={[
            'flex flex-col items-stretch gap-3 rounded-md border-2 border-dashed bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
            dragOver ? 'border-primary bg-primary/5' : 'border-border',
          ].join(' ')}
        >
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon icon={ImageIcon} className="size-4" />
            <span>{uploading ? 'Загружаем…' : 'Перетащите или вставьте изображение'}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={accept}
              className="sr-only"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void uploadFile(file);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Icon icon={Upload} /> Загрузить
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
              <Icon icon={Search} /> Выбрать
            </Button>
          </div>
        </section>
      )}

      {error ? (
        <FieldError>{error}</FieldError>
      ) : uploadError ? (
        <FieldError>{uploadError}</FieldError>
      ) : field.description ? (
        <FieldDescription>{field.description}</FieldDescription>
      ) : null}

      <MediaPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={handleSelect}
        {...(field.accept ? { accept: field.accept } : {})}
      />
    </Field>
  );
}
