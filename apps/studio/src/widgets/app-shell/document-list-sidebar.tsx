import {
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  Skeleton,
} from '@minecms/ui';
import { ImageIcon, MoreVertical, Plus, Trash2 } from '@minecms/ui/icons';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useMemo, useRef, useState } from 'react';
import type { SerializedField, SerializedSchema } from '../../entities/field-renderer';
import type { MediaAsset } from '../../entities/media';
import { trpc } from '../../shared/api/client';
import { useSidebarWheelTrap } from './use-sidebar-wheel-trap';

const LIST_LIMIT = 200;

/**
 * Третий пейн Studio: inline-список документов выбранной схемы.
 *
 * Семантика «как в Sanity»: панель остаётся видимой при выборе документа,
 * редактор открывается в main, активный пункт подсвечен. Без пагинации:
 * берём первые `LIST_LIMIT` записей одним запросом, скроллим внутри пейна.
 *
 * Превью документа собирается эвристически из схемы:
 * - title — первое поле типа `string` / `slug`;
 * - description — первое `text` или второе `string`;
 * - avatar — первое `image`-поле;
 * - published-индикатор — boolean-поле с именем `published`.
 *
 * `variant`:
 * - `sidebar` (по умолчанию) — третий пейн рядом с main (desktop, `lg+`);
 * - `inline` — тот же контент, но в потоке main (используется на мобильных).
 */
export interface DocumentListSidebarProps {
  schema: SerializedSchema;
  variant?: 'sidebar' | 'inline';
}

export function DocumentListSidebar(props: DocumentListSidebarProps): React.JSX.Element {
  const variant = props.variant ?? 'sidebar';
  const scrollRef = useRef<HTMLDivElement>(null);
  useSidebarWheelTrap(scrollRef);
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const list = trpc.documents.list.useQuery({
    schema: props.schema.name,
    limit: LIST_LIMIT,
    offset: 0,
  });

  // ⋯-меню → ConfirmDialog → documents.delete (soft delete → в Корзину).
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const deleteMutation = trpc.documents.delete.useMutation({
    onSuccess: async () => {
      const deletedId = pendingDeleteId;
      setPendingDeleteId(null);
      await utils.documents.list.invalidate({ schema: props.schema.name });
      await utils.documents.count.invalidate({ schema: props.schema.name });
      await utils.trash.summary.invalidate();
      const params = currentDocumentParam();
      if (deletedId !== null && params.documentId === String(deletedId)) {
        await navigate({
          to: '/schema/$schemaName',
          params: { schemaName: props.schema.name },
        });
      }
    },
  });

  const fieldEntries = Object.entries(props.schema.fields);
  const { titleField, descriptionField, coverField, publishedField } = useMemo(
    () => resolvePreviewFields(fieldEntries),
    [fieldEntries],
  );

  const items = list.data?.items ?? [];

  // Активный документ — из URL: на /schema/$name/$documentId он есть, иначе пусто.
  const params = useParams({ strict: false }) as { documentId?: string };
  const activeId = params.documentId !== undefined ? Number(params.documentId) : null;

  // Префетчим обложки одним батч-запросом — иначе по запросу на каждую строку.
  const coverAssetIds = useMemo(() => {
    if (coverField === null) return [];
    const ids = new Set<number>();
    for (const row of items) {
      const id = readAssetId((row as Record<string, unknown>)[coverField]);
      if (id !== null) ids.add(id);
    }
    return Array.from(ids);
  }, [items, coverField]);

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
  const coversLoading = coverAssetIds.length > 0 && coverAssetsQuery.isLoading;

  const listBody = (
    <>
      {list.isLoading ? (
        <div className="flex flex-col gap-1">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : list.isError ? (
        <p className="px-2 py-1.5 text-xs text-destructive">{list.error.message}</p>
      ) : items.length === 0 ? (
        <EmptyHint schemaName={props.schema.name} />
      ) : (
        <ul className="flex flex-col gap-0.5" role="list">
          {items.map((row, idx) => {
            const raw = row as Record<string, unknown>;
            const id = raw.id;
            const numericId = typeof id === 'number' ? id : Number(id);
            const isActive = activeId !== null && numericId === activeId;
            const coverAssetId = coverField !== null ? readAssetId(raw[coverField]) : null;
            const coverAsset =
              coverAssetId !== null ? (coverAssetsById.get(coverAssetId) ?? null) : null;
            const coverAlt = coverField !== null ? readAlt(raw[coverField]) : null;
            return (
              <li key={typeof id === 'string' || typeof id === 'number' ? String(id) : idx}>
                <DocumentListItem
                  schemaName={props.schema.name}
                  documentId={numericId}
                  isActive={isActive}
                  title={titleField !== null ? readString(raw[titleField]) : null}
                  description={descriptionField !== null ? readString(raw[descriptionField]) : null}
                  coverAssetId={coverAssetId}
                  coverAsset={coverAsset}
                  coverAlt={coverAlt}
                  coversLoading={coversLoading}
                  published={publishedField !== null ? readBoolean(raw[publishedField]) : null}
                  onRequestDelete={() => setPendingDeleteId(numericId)}
                />
              </li>
            );
          })}
          {list.data && list.data.total > items.length ? (
            <li className="px-2 pt-2">
              <p className="text-xs text-muted-foreground">
                Показано первые {items.length} из {list.data.total}.
              </p>
            </li>
          ) : null}
        </ul>
      )}
    </>
  );

  const confirmDialog = (
    <ConfirmDialog
      open={pendingDeleteId !== null}
      onOpenChange={(open) => {
        if (!open) setPendingDeleteId(null);
      }}
      title="Удалить?"
      description="Документ переедет в корзину. Передумаете — сможете вернуть."
      confirmLabel="Удалить"
      loading={deleteMutation.isPending}
      onConfirm={() => {
        if (pendingDeleteId === null) return;
        deleteMutation.mutate({ schema: props.schema.name, id: pendingDeleteId });
      }}
    />
  );

  if (variant === 'inline') {
    return (
      <section className="flex flex-col gap-4">
        <header className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {props.schema.label}
            </p>
            <p className="truncate text-xs text-muted-foreground/70">
              {list.data ? `${list.data.total} ${pluralize(list.data.total)}` : '\u00A0'}
            </p>
          </div>
          <Button asChild size="sm">
            <Link to="/schema/$schemaName/new" params={{ schemaName: props.schema.name }}>
              <Icon icon={Plus} className="size-3.5" /> Создать
            </Link>
          </Button>
        </header>
        <div className="rounded-md border border-border bg-card p-2">{listBody}</div>
        {confirmDialog}
      </section>
    );
  }

  return (
    <>
      <aside className="hidden min-h-0 w-80 shrink-0 flex-col overflow-hidden border-l border-border bg-card lg:flex">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {props.schema.label}
            </p>
            <p className="truncate text-xs text-muted-foreground/70">
              {list.data ? `${list.data.total} ${pluralize(list.data.total)}` : '\u00A0'}
            </p>
          </div>
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link to="/schema/$schemaName/new" params={{ schemaName: props.schema.name }}>
              <Icon icon={Plus} className="size-3.5" />
              <span className="sr-only">Создать</span>
            </Link>
          </Button>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-2">
          {listBody}
        </div>
      </aside>
      {confirmDialog}
    </>
  );
}

/**
 * Минимальная утилита: считывает `documentId` из текущего URL без хука роутера.
 * Хук `useParams` сужает тип под конкретный роут — нам не нужно знать его точно,
 * нам нужно только сравнить id для optional-навигации после удаления.
 */
function currentDocumentParam(): { documentId: string | null } {
  if (typeof window === 'undefined') return { documentId: null };
  const match = window.location.pathname.match(/\/schema\/[^/]+\/(\d+)/);
  return { documentId: match?.[1] ?? null };
}

interface DocumentListItemProps {
  schemaName: string;
  documentId: number;
  isActive: boolean;
  title: string | null;
  description: string | null;
  coverAssetId: number | null;
  coverAsset: MediaAsset | null;
  coverAlt: string | null;
  coversLoading: boolean;
  published: boolean | null;
  onRequestDelete: () => void;
}

function DocumentListItem(props: DocumentListItemProps): React.JSX.Element {
  const title = props.title?.trim() || `Без названия · #${props.documentId}`;
  // Контейнер группы: `group` + `hover:` управляет видимостью ⋯-кнопки.
  // Внутри — Link на всю площадь и абсолютно позиционированный action-slot
  // справа: нельзя вкладывать <button> в <a>, поэтому это два соседних узла.
  return (
    <div
      className="group relative flex w-full min-w-0 rounded-md transition-colors hover:bg-accent data-[active=true]:bg-accent"
      data-active={props.isActive ? 'true' : undefined}
    >
      <Link
        to="/schema/$schemaName/$documentId"
        params={{ schemaName: props.schemaName, documentId: String(props.documentId) }}
        data-status={props.isActive ? 'active' : undefined}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 pr-9 text-left"
      >
        <CoverThumb
          assetId={props.coverAssetId}
          asset={props.coverAsset}
          alt={props.coverAlt}
          loading={props.coversLoading}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            {props.published !== null ? <StatusDot published={props.published} /> : null}
            <span className="truncate text-sm font-medium text-foreground">{title}</span>
          </div>
          {props.description ? (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{props.description}</p>
          ) : null}
        </div>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Действия"
            className="absolute right-1 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <Icon icon={MoreVertical} className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant="destructive"
            onSelect={(e) => {
              e.preventDefault();
              props.onRequestDelete();
            }}
          >
            <Icon icon={Trash2} />
            Удалить
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function StatusDot(props: { published: boolean }): React.JSX.Element {
  return (
    <span
      aria-label={props.published ? 'Опубликовано' : 'Черновик'}
      title={props.published ? 'Опубликовано' : 'Черновик'}
      className={`inline-block size-2 shrink-0 rounded-full ${
        props.published ? 'bg-emerald-500' : 'bg-amber-500'
      }`}
    />
  );
}

function CoverThumb(props: {
  assetId: number | null;
  asset: MediaAsset | null;
  alt: string | null;
  loading: boolean;
}): React.JSX.Element {
  if (props.assetId === null) {
    return (
      <div
        className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
        aria-hidden="true"
      >
        <Icon icon={ImageIcon} className="size-4" />
      </div>
    );
  }
  if (props.loading || !props.asset) {
    return <Skeleton className="size-10 shrink-0 rounded-md" />;
  }
  if (!props.asset.viewUrl) {
    return (
      <div
        className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
        role="img"
        aria-label="Изображение недоступно"
      >
        <Icon icon={ImageIcon} className="size-4" />
      </div>
    );
  }
  return (
    <img
      src={props.asset.viewUrl}
      alt={props.alt ?? props.asset.alt ?? props.asset.originalFilename}
      width={40}
      height={40}
      loading="lazy"
      className="size-10 shrink-0 rounded-md bg-muted object-cover"
    />
  );
}

function EmptyHint(props: { schemaName: string }): React.JSX.Element {
  return (
    <div className="flex flex-col items-start gap-2 px-2 py-3">
      <p className="text-xs text-muted-foreground">Документов пока нет.</p>
      <Button asChild size="sm" variant="outline">
        <Link to="/schema/$schemaName/new" params={{ schemaName: props.schemaName }}>
          <Icon icon={Plus} className="size-3.5" /> Создать первый
        </Link>
      </Button>
    </div>
  );
}

interface PreviewFields {
  titleField: string | null;
  descriptionField: string | null;
  coverField: string | null;
  publishedField: string | null;
}

function resolvePreviewFields(entries: Array<[string, SerializedField]>): PreviewFields {
  let titleField: string | null = null;
  let descriptionField: string | null = null;
  let coverField: string | null = null;
  let publishedField: string | null = null;
  let secondaryStringField: string | null = null;

  for (const [name, field] of entries) {
    if (coverField === null && field.type === 'image') {
      coverField = name;
    }
    if (titleField === null && (field.type === 'string' || field.type === 'slug')) {
      titleField = name;
      continue;
    }
    if (descriptionField === null && field.type === 'text') {
      descriptionField = name;
    }
    if (
      secondaryStringField === null &&
      titleField !== null &&
      titleField !== name &&
      field.type === 'string'
    ) {
      secondaryStringField = name;
    }
    if (
      publishedField === null &&
      field.type === 'boolean' &&
      (name === 'published' || name === 'isPublished' || name === 'publish')
    ) {
      publishedField = name;
    }
  }

  if (descriptionField === null && secondaryStringField !== null) {
    descriptionField = secondaryStringField;
  }

  return { titleField, descriptionField, coverField, publishedField };
}

function readAssetId(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const id = (value as { assetId?: unknown }).assetId;
  if (typeof id === 'number' && Number.isFinite(id) && id > 0) return id;
  if (typeof id === 'string') {
    const n = Number(id);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function readAlt(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const alt = (value as { alt?: unknown }).alt;
  return typeof alt === 'string' && alt.length > 0 ? alt : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  return null;
}

function pluralize(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'запись';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'записи';
  return 'записей';
}
