import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  ConfirmDialog,
  Icon,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@minecms/ui';
import { ChevronLeft, ChevronRight, ImageIcon, Pencil, Trash2 } from '@minecms/ui/icons';
import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { FieldDisplay, type SerializedSchema } from '../../entities/field-renderer';
import type { MediaAsset } from '../../entities/media';
import { trpc } from '../../shared/api/client';

const PAGE_SIZE = 25;
const PREVIEW_SIZE_PX = 40;

/**
 * Универсальная таблица документов одной схемы.
 *
 * Колонки берутся из `schema.fields` в порядке объявления; технические `id`
 * и timestamps намеренно скрыты — для просмотра деталей есть страница `[id]`.
 *
 * Удаление — inline через `documents.delete` с подтверждением.
 */
export interface DocumentListTableProps {
  schema: SerializedSchema;
}

export function DocumentListTable(props: DocumentListTableProps): React.JSX.Element {
  const [offset, setOffset] = useState(0);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const utils = trpc.useUtils();
  const list = trpc.documents.list.useQuery({
    schema: props.schema.name,
    limit: PAGE_SIZE,
    offset,
  });
  const deleteMutation = trpc.documents.delete.useMutation({
    onSuccess: async () => {
      setPendingDeleteId(null);
      await utils.documents.list.invalidate({ schema: props.schema.name });
      await utils.documents.count.invalidate({ schema: props.schema.name });
      await utils.trash.summary.invalidate();
    },
  });

  const allFieldEntries = Object.entries(props.schema.fields);
  // Первое image-поле схемы выступает «обложкой» документа: его превью идёт
  // префиксом в первой не-image колонке, а сама эта колонка в таблице не
  // показывается, чтобы не дублировать визуал.
  const coverFieldName = allFieldEntries.find(([, field]) => field.type === 'image')?.[0] ?? null;
  const fieldEntries =
    coverFieldName !== null
      ? allFieldEntries.filter(([name]) => name !== coverFieldName)
      : allFieldEntries;
  // Если кроме cover-image полей в схеме ничего нет — fallback к старому поведению,
  // чтобы таблица не оказалась без колонок данных.
  const visibleFieldEntries = fieldEntries.length > 0 ? fieldEntries : allFieldEntries;
  const effectiveCoverField = fieldEntries.length > 0 ? coverFieldName : null;

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  // Уникальные assetId всех cover-полей текущей страницы — батчим в один запрос.
  const coverAssetIds = useMemo(() => {
    if (effectiveCoverField === null) return [];
    const ids = new Set<number>();
    for (const row of items) {
      const id = readCoverAssetId((row as Record<string, unknown>)[effectiveCoverField]);
      if (id !== null) ids.add(id);
    }
    return Array.from(ids);
  }, [items, effectiveCoverField]);

  const coverAssetsQuery = trpc.media.getMany.useQuery(
    { ids: coverAssetIds },
    { enabled: coverAssetIds.length > 0 },
  );
  const coverAssetsById = useMemo(() => {
    const map = new Map<number, MediaAsset>();
    const fetched = (coverAssetsQuery.data?.items ?? []) as unknown as MediaAsset[];
    for (const asset of fetched) {
      map.set(asset.id, asset);
    }
    return map;
  }, [coverAssetsQuery.data]);
  const coverAssetsLoading = coverAssetIds.length > 0 && coverAssetsQuery.isLoading;

  function handleConfirmDelete(): void {
    if (pendingDeleteId === null) return;
    deleteMutation.mutate({ schema: props.schema.name, id: pendingDeleteId });
  }

  if (list.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Не удалось загрузить документы</AlertTitle>
        <AlertDescription>{list.error.message}</AlertDescription>
      </Alert>
    );
  }

  if (list.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center">
        <p className="text-sm font-medium">Документов пока нет.</p>
        <p className="mt-1 text-sm text-muted-foreground">Создайте первый — он появится здесь.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              {visibleFieldEntries.map(([name, field]) => (
                <TableHead key={name}>{field.label}</TableHead>
              ))}
              <TableHead className="w-px text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row, idx) => {
              const id = (row as Record<string, unknown>).id;
              const numericId = typeof id === 'number' ? id : Number(id);
              const coverAssetId =
                effectiveCoverField !== null
                  ? readCoverAssetId((row as Record<string, unknown>)[effectiveCoverField])
                  : null;
              const coverAsset = coverAssetId !== null ? coverAssetsById.get(coverAssetId) : null;
              const coverAlt = readCoverAlt(
                effectiveCoverField !== null
                  ? (row as Record<string, unknown>)[effectiveCoverField]
                  : null,
              );
              return (
                <TableRow key={typeof id === 'string' || typeof id === 'number' ? String(id) : idx}>
                  {visibleFieldEntries.map(([fieldName, field], cellIdx) => {
                    const isFirstCell = cellIdx === 0;
                    const showPreview = isFirstCell && effectiveCoverField !== null;
                    return (
                      <TableCell key={fieldName}>
                        {showPreview ? (
                          <div className="flex items-center gap-3">
                            <CoverPreview
                              assetId={coverAssetId}
                              asset={coverAsset ?? null}
                              alt={coverAlt}
                              loading={coverAssetsLoading}
                            />
                            <div className="min-w-0 flex-1">
                              <FieldDisplay
                                field={field}
                                value={(row as Record<string, unknown>)[fieldName]}
                              />
                            </div>
                          </div>
                        ) : (
                          <FieldDisplay
                            field={field}
                            value={(row as Record<string, unknown>)[fieldName]}
                          />
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" asChild>
                        <Link
                          {...(props.schema.singleton
                            ? {
                                to: '/schema/$schemaName',
                                params: { schemaName: props.schema.name },
                              }
                            : {
                                to: '/schema/$schemaName/$documentId',
                                params: {
                                  schemaName: props.schema.name,
                                  documentId: String(numericId),
                                },
                              })}
                          aria-label="Редактировать"
                        >
                          <Icon icon={Pencil} />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setPendingDeleteId(numericId)}
                        disabled={deleteMutation.isPending}
                        aria-label="Удалить"
                      >
                        <Icon icon={Trash2} className="text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {offset + 1}–{Math.min(offset + items.length, total)} из {total}
        </span>
        <div className="flex items-center gap-2">
          <span className="tabular-nums">
            Стр. {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!canPrev}
            onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
          >
            <Icon icon={ChevronLeft} /> Назад
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canNext}
            onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
          >
            Дальше <Icon icon={ChevronRight} />
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
        title="Удалить?"
        description="Документ переедет в корзину. Передумаете — сможете вернуть."
        confirmLabel="Удалить"
        loading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

interface CoverPreviewProps {
  assetId: number | null;
  asset: MediaAsset | null;
  alt: string | null;
  loading: boolean;
}

/**
 * Маленькая квадратная превьюшка обложки документа в первой ячейке таблицы.
 *
 * Состояния:
 * - у строки нет cover-поля или `assetId === null` → пустой square-плейсхолдер
 *   (`bg-muted` с иконкой) — чтобы строки не «прыгали» по выравниванию.
 * - ассеты ещё грузятся (`media.getMany` в полёте) → Skeleton того же размера.
 * - ассет загружен, есть `viewUrl` → `<img>` с `object-cover` и `loading="lazy"`.
 * - ассет удалён / `viewUrl === null` → ImageIcon-плейсхолдер.
 */
function CoverPreview(props: CoverPreviewProps): React.JSX.Element {
  const { assetId, asset, alt, loading } = props;
  const sizeClass = 'size-10';

  if (assetId === null) {
    return (
      <div
        className={`${sizeClass} flex shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground`}
        aria-hidden="true"
      >
        <Icon icon={ImageIcon} className="size-4" />
      </div>
    );
  }

  if (loading || !asset) {
    return <Skeleton className={`${sizeClass} shrink-0 rounded-md`} />;
  }

  if (!asset.viewUrl) {
    return (
      <div
        className={`${sizeClass} flex shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground`}
        aria-label="Изображение недоступно"
        role="img"
      >
        <Icon icon={ImageIcon} className="size-4" />
      </div>
    );
  }

  return (
    <img
      src={asset.viewUrl}
      alt={alt ?? asset.alt ?? asset.originalFilename}
      width={PREVIEW_SIZE_PX}
      height={PREVIEW_SIZE_PX}
      loading="lazy"
      className={`${sizeClass} shrink-0 rounded-md bg-muted object-cover`}
    />
  );
}

/**
 * Извлекает `assetId` из значения image-поля документа. Допустимые формы:
 * `null`, `undefined`, `{ assetId: number, alt?: string }`. На остальное
 * (строку, число, массив) возвращаем `null` — UI покажет пустую плашку.
 */
function readCoverAssetId(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const id = (value as { assetId?: unknown }).assetId;
  if (typeof id === 'number' && Number.isFinite(id) && id > 0) return id;
  if (typeof id === 'string') {
    const n = Number(id);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function readCoverAlt(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const alt = (value as { alt?: unknown }).alt;
  return typeof alt === 'string' && alt.length > 0 ? alt : null;
}
