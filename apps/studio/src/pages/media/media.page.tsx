import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  Icon,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@minecms/ui';
import { ImageIcon, Trash2, Upload } from '@minecms/ui/icons';
import { useRef, useState } from 'react';
import { formatBytes, type MediaAsset, uploadMediaFile } from '../../entities/media';
import { trpc } from '../../shared/api/client';
import { AppShell } from '../../widgets/app-shell/app-shell';

/**
 * Страница `/media` — библиотека загруженных файлов. Позволяет:
 *
 *  - загрузить новый файл (drag/drop, paste, кнопка),
 *  - просмотреть список файлов с превью и метаданными (MIME, размер, дата),
 *  - отредактировать `alt` (основная мета для image-полей) inline,
 *  - удалить файл (если он не используется в документах — иначе server вернёт ошибку).
 *
 * Список — компактная таблица в стиле `DocumentListTable`, с горизонтальным
 * скроллом на узких экранах (даёт сам компонент `<Table>`).
 */
export function MediaPage(): React.JSX.Element {
  const utils = trpc.useUtils();
  const list = trpc.media.list.useQuery({ limit: 200, offset: 0 });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const items = (list.data?.items ?? []) as unknown as MediaAsset[];

  async function handleFile(file: File): Promise<void> {
    setUploadError(null);
    setUploading(true);
    try {
      await uploadMediaFile(file);
      await utils.media.list.invalidate();
    } catch (err) {
      setUploadError((err as Error).message ?? 'Не удалось загрузить файл.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Библиотека</p>
            <h1 className="text-2xl font-semibold tracking-tight">Медиа</h1>
            <p className="text-sm text-muted-foreground">
              {list.data ? `Всего файлов: ${list.data.total}` : 'Загружаем библиотеку…'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void handleFile(file);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
            />
            <Button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Icon icon={Upload} /> {uploading ? 'Загружаем…' : 'Загрузить'}
            </Button>
          </div>
        </header>

        <section
          aria-label="Зона загрузки файла"
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
            if (file) void handleFile(file);
          }}
          onPaste={(event) => {
            const file = Array.from(event.clipboardData?.files ?? [])[0];
            if (file) {
              event.preventDefault();
              void handleFile(file);
            }
          }}
          className={[
            'rounded-md border-2 border-dashed bg-muted/30 px-4 py-6 text-center text-sm',
            dragOver ? 'border-primary bg-primary/5' : 'border-border text-muted-foreground',
          ].join(' ')}
        >
          Перетащите изображение сюда или вставьте из буфера обмена.
        </section>

        {uploadError && (
          <Alert variant="destructive">
            <AlertTitle>Не удалось загрузить файл</AlertTitle>
            <AlertDescription>{uploadError}</AlertDescription>
          </Alert>
        )}

        {list.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Icon icon={ImageIcon} className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Библиотека пуста. Загрузите первый файл — изображения сразу появятся здесь.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-px">Превью</TableHead>
                  <TableHead>Имя файла</TableHead>
                  <TableHead>MIME / размеры</TableHead>
                  <TableHead>Размер</TableHead>
                  <TableHead>Создан</TableHead>
                  <TableHead>Alt-текст</TableHead>
                  <TableHead className="w-px text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <MediaRow key={item.id} asset={item} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </AppShell>
  );
}

/**
 * RU-формат `dd.mm.yyyy HH:MM` для timestamp'ов медиа-ассетов.
 *
 * Использует `Intl.DateTimeFormat('ru-RU')` с явным `2-digit`, чтобы значения
 * выглядели одинаково по ширине и не «прыгали» в табличной колонке.
 * Для невалидных строк возвращает прочерк — UI остаётся консистентным.
 */
const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  // Intl возвращает `dd.mm.yyyy, HH:MM` — убираем запятую для компактного формата.
  return dateFormatter.format(date).replace(',', '');
}

function MediaRow(props: { asset: MediaAsset }): React.JSX.Element {
  const { asset } = props;
  const utils = trpc.useUtils();
  const [alt, setAlt] = useState(asset.alt ?? '');
  const [pendingAlt, setPendingAlt] = useState(false);
  const [previewBroken, setPreviewBroken] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const updateMutation = trpc.media.update.useMutation({
    onSuccess: () => {
      void utils.media.list.invalidate();
      void utils.media.get.invalidate({ id: asset.id });
    },
  });
  const deleteMutation = trpc.media.delete.useMutation({
    onSuccess: () => {
      setConfirmOpen(false);
      void utils.media.list.invalidate();
      void utils.trash.summary.invalidate();
    },
  });

  function handleAltCommit(): void {
    if ((asset.alt ?? '') === alt) return;
    setPendingAlt(true);
    updateMutation.mutate(
      { id: asset.id, alt: alt.trim().length === 0 ? null : alt },
      { onSettled: () => setPendingAlt(false) },
    );
  }

  function handleConfirmDelete(): void {
    deleteMutation.mutate({ id: asset.id });
  }

  const dimensions = asset.width && asset.height ? `${asset.width}×${asset.height}` : null;
  const showImage = asset.viewUrl && !previewBroken;

  return (
    <TableRow>
      <TableCell className="w-px">
        {showImage ? (
          <img
            src={asset.viewUrl ?? undefined}
            alt={asset.alt ?? asset.originalFilename}
            width={48}
            height={48}
            loading="lazy"
            onError={() => setPreviewBroken(true)}
            className="size-12 shrink-0 rounded-md bg-muted object-cover"
          />
        ) : (
          <div
            className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
            aria-label="Изображение недоступно"
            role="img"
          >
            <Icon icon={ImageIcon} className="size-5" />
          </div>
        )}
      </TableCell>
      <TableCell className="max-w-[16rem]">
        <p className="truncate text-sm font-medium" title={asset.originalFilename}>
          {asset.originalFilename}
        </p>
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
        {asset.mimeType}
        {dimensions !== null ? ` · ${dimensions}` : ''}
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
        {formatBytes(asset.size)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
        {formatDateTime(asset.createdAt)}
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <Input
            value={alt}
            onChange={(event) => setAlt(event.currentTarget.value)}
            onBlur={handleAltCommit}
            placeholder="Alt-текст"
            maxLength={500}
            disabled={pendingAlt}
            className="h-8 w-40 sm:w-56"
          />
          {deleteMutation.isError && (
            <p className="text-xs text-destructive">{deleteMutation.error.message}</p>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setConfirmOpen(true)}
          disabled={deleteMutation.isPending}
          aria-label="Удалить"
        >
          <Icon icon={Trash2} className="text-destructive" />
        </Button>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Удалить файл?"
          description={`«${asset.originalFilename}» переедет в корзину. Передумаете — сможете вернуть.`}
          confirmLabel="Удалить"
          loading={deleteMutation.isPending}
          onConfirm={handleConfirmDelete}
        />
      </TableCell>
    </TableRow>
  );
}
