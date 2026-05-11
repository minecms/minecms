import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Skeleton,
} from '@minecms/ui';
import { Close, ImageIcon, Upload } from '@minecms/ui/icons';
import { useId, useRef, useState } from 'react';
import { formatBytes, type MediaAsset, uploadMediaFile } from '../../entities/media';
import { trpc } from '../../shared/api/client';

export interface MediaPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Вызывается, когда пользователь выбрал ассет — диалог должен закрыться. */
  onSelect: (asset: MediaAsset) => void;
  /** Если задано — фильтруем по этим mime-типам в input[type=file]. */
  accept?: readonly string[];
}

/**
 * Диалог выбора медиа-файла.
 *
 * Состоит из: блока загрузки (input file + drop), сетки уже загруженных
 * ассетов и кнопок «Отмена» / «Выбрать». Используется и в `ImageInput`
 * (кнопка `Select`), и в страницах списков.
 */
export function MediaPickerDialog(props: MediaPickerDialogProps): React.JSX.Element {
  const { open, onOpenChange, onSelect, accept } = props;
  const utils = trpc.useUtils();
  const list = trpc.media.list.useQuery({ limit: 50, offset: 0 }, { enabled: open });
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const items = (list.data?.items ?? []) as unknown as MediaAsset[];

  const acceptValue = accept ? accept.join(',') : 'image/*';

  async function handleFile(file: File): Promise<void> {
    setUploadError(null);
    setUploading(true);
    try {
      const { asset } = await uploadMediaFile(file);
      await utils.media.list.invalidate();
      setSelected(asset);
    } catch (err) {
      setUploadError((err as Error).message ?? 'Не удалось загрузить файл.');
    } finally {
      setUploading(false);
    }
  }

  function handleConfirm(): void {
    if (selected) {
      onSelect(selected);
      onOpenChange(false);
      setSelected(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setSelected(null);
          setUploadError(null);
        }
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Выбор изображения</DialogTitle>
          <DialogDescription>
            Загрузите новый файл или выберите ранее загруженный.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-md border border-dashed border-border bg-muted/40 p-3">
          <input
            id={fileInputId}
            ref={fileInputRef}
            type="file"
            accept={acceptValue}
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void handleFile(file);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Icon icon={Upload} /> {uploading ? 'Загружаем…' : 'Загрузить файл'}
          </Button>
          {uploadError ? (
            <p className="text-sm text-destructive">{uploadError}</p>
          ) : (
            <p className="text-sm text-muted-foreground">JPEG, PNG, WebP или GIF. До 25 MB.</p>
          )}
        </div>

        {list.isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="aspect-square w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-muted/30 py-12">
            <Icon icon={ImageIcon} className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              В библиотеке пока нет файлов. Загрузите первый.
            </p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {items.map((item) => {
                const isActive = selected?.id === item.id;
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className={[
                      'group relative flex aspect-square flex-col overflow-hidden rounded-md border bg-background text-left transition-shadow',
                      isActive
                        ? 'border-primary ring-2 ring-primary'
                        : 'border-border hover:border-foreground/40',
                    ].join(' ')}
                  >
                    {item.viewUrl ? (
                      <img
                        src={item.viewUrl}
                        alt={item.alt ?? item.originalFilename}
                        className="size-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center bg-muted text-muted-foreground">
                        <Icon icon={ImageIcon} className="size-6" />
                      </div>
                    )}
                    <span className="absolute inset-x-0 bottom-0 truncate bg-background/85 px-2 py-1 text-[11px] text-foreground">
                      {item.originalFilename}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              <Icon icon={Close} /> Отмена
            </Button>
          </DialogClose>
          <Button type="button" disabled={!selected} onClick={handleConfirm}>
            Выбрать{selected ? ` · ${formatBytes(selected.size)}` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
