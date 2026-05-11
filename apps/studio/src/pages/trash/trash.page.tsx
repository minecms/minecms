import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  ConfirmDialog,
  Icon,
  Skeleton,
} from '@minecms/ui';
import { FileText, ImageIcon, RotateCcw, Trash2 } from '@minecms/ui/icons';
import { useMemo, useState } from 'react';
import { trpc } from '../../shared/api/client';
import { AppShell } from '../../widgets/app-shell/app-shell';

type Filter = { kind: 'all' } | { kind: 'schema'; schema: string } | { kind: 'media' };

/**
 * «Корзина» — единая страница для всего soft-deleted контента.
 *
 * Один общий список (документы любых схем + медиа), сверху — чипы-фильтры
 * с количеством в каждой группе. Сортировка по дате удаления (свежие сверху).
 */
export function TrashPage(): React.JSX.Element {
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const [pending, setPending] = useState<PendingPurge | null>(null);

  const utils = trpc.useUtils();
  const list = trpc.trash.listAll.useQuery();

  const restoreDoc = trpc.trash.restoreDocument.useMutation({
    onSuccess: async () => {
      await invalidate(utils);
    },
  });
  const restoreMedia = trpc.trash.restoreMedia.useMutation({
    onSuccess: async () => {
      await invalidate(utils);
    },
  });
  const purgeDoc = trpc.trash.purgeDocument.useMutation({
    onSuccess: async () => {
      setPending(null);
      await invalidate(utils);
    },
  });
  const purgeMedia = trpc.trash.purgeMedia.useMutation({
    onSuccess: async () => {
      setPending(null);
      await invalidate(utils);
    },
  });

  const items = list.data?.items ?? [];

  const counts = useMemo(() => {
    const bySchema = new Map<string, { label: string; total: number }>();
    let media = 0;
    for (const item of items) {
      if (item.kind === 'media') {
        media += 1;
      } else {
        const prev = bySchema.get(item.schema);
        bySchema.set(item.schema, {
          label: item.schemaLabel,
          total: (prev?.total ?? 0) + 1,
        });
      }
    }
    return { bySchema: Array.from(bySchema.entries()), media, total: items.length };
  }, [items]);

  const filtered = useMemo(() => {
    if (filter.kind === 'all') return items;
    if (filter.kind === 'media') return items.filter((i) => i.kind === 'media');
    return items.filter((i) => i.kind === 'document' && i.schema === filter.schema);
  }, [items, filter]);

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold">Корзина</h1>
          <p className="text-sm text-muted-foreground">
            Здесь то, что вы удалили. Можно вернуть обратно или удалить навсегда.
          </p>
        </header>

        {list.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Не получилось загрузить корзину</AlertTitle>
            <AlertDescription>{list.error.message}</AlertDescription>
          </Alert>
        ) : (
          <>
            <FilterChips
              loading={list.isLoading}
              filter={filter}
              onChange={setFilter}
              counts={counts}
            />

            {list.isLoading ? (
              <ListSkeleton />
            ) : filtered.length === 0 ? (
              <EmptyHint>Здесь пусто.</EmptyHint>
            ) : (
              <ul className="flex flex-col gap-1">
                {filtered.map((item) => (
                  <li
                    key={`${item.kind}-${item.kind === 'document' ? item.schema : 'media'}-${item.id}`}
                    className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
                  >
                    <Preview item={item} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.kind === 'media' ? item.mimeType : item.schemaLabel}
                        {item.deletedAt
                          ? ` · удалено ${new Date(item.deletedAt).toLocaleString('ru-RU')}`
                          : ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={restoreDoc.isPending || restoreMedia.isPending}
                      onClick={() => {
                        if (item.kind === 'media') {
                          restoreMedia.mutate({ section: 'media', id: item.id });
                        } else {
                          restoreDoc.mutate({
                            section: 'documents',
                            schema: item.schema,
                            id: item.id,
                          });
                        }
                      }}
                    >
                      <Icon icon={RotateCcw} className="mr-1.5" />
                      Вернуть
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Удалить навсегда"
                      onClick={() =>
                        setPending(
                          item.kind === 'media'
                            ? { kind: 'media', id: item.id, title: item.title }
                            : {
                                kind: 'document',
                                id: item.id,
                                schema: item.schema,
                                title: item.title,
                              },
                        )
                      }
                    >
                      <Icon icon={Trash2} className="text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={
          pending?.kind === 'media' ? 'Удалить файл навсегда?' : 'Удалить навсегда?'
        }
        description={
          pending?.kind === 'media'
            ? `«${pending.title}» исчезнет совсем. Это действие нельзя отменить.`
            : 'Это действие нельзя отменить.'
        }
        confirmLabel="Удалить навсегда"
        loading={purgeDoc.isPending || purgeMedia.isPending}
        onConfirm={() => {
          if (!pending) return;
          if (pending.kind === 'media') {
            purgeMedia.mutate({ section: 'media', id: pending.id });
          } else {
            purgeDoc.mutate({
              section: 'documents',
              schema: pending.schema,
              id: pending.id,
            });
          }
        }}
      />
    </AppShell>
  );
}

type PendingPurge =
  | { kind: 'document'; id: number; schema: string; title: string }
  | { kind: 'media'; id: number; title: string };

interface Counts {
  bySchema: Array<[string, { label: string; total: number }]>;
  media: number;
  total: number;
}

function FilterChips(props: {
  loading: boolean;
  filter: Filter;
  onChange: (next: Filter) => void;
  counts: Counts;
}): React.JSX.Element {
  if (props.loading) {
    return (
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-24" />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Chip
        active={props.filter.kind === 'all'}
        onClick={() => props.onChange({ kind: 'all' })}
        label="Всё"
        count={props.counts.total}
      />
      {props.counts.bySchema.map(([schema, { label, total }]) => (
        <Chip
          key={schema}
          active={props.filter.kind === 'schema' && props.filter.schema === schema}
          onClick={() => props.onChange({ kind: 'schema', schema })}
          label={label}
          count={total}
        />
      ))}
      {props.counts.media > 0 ? (
        <Chip
          active={props.filter.kind === 'media'}
          onClick={() => props.onChange({ kind: 'media' })}
          label="Медиа"
          count={props.counts.media}
        />
      ) : null}
    </div>
  );
}

function Chip(props: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
        props.active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-card text-foreground hover:bg-accent',
      ].join(' ')}
    >
      <span>{props.label}</span>
      <span
        className={[
          'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs tabular-nums',
          props.active ? 'bg-background/20 text-background' : 'bg-muted text-muted-foreground',
        ].join(' ')}
      >
        {props.count}
      </span>
    </button>
  );
}

function Preview(props: {
  item:
    | { kind: 'document'; schema: string; schemaLabel: string }
    | { kind: 'media'; viewUrl: string | null; title: string };
}): React.JSX.Element {
  if (props.item.kind === 'media') {
    if (props.item.viewUrl) {
      return (
        <img
          src={props.item.viewUrl}
          alt={props.item.title}
          width={40}
          height={40}
          loading="lazy"
          className="size-10 shrink-0 rounded bg-muted object-cover"
        />
      );
    }
    return (
      <div className="flex size-10 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
        <Icon icon={ImageIcon} className="size-4" />
      </div>
    );
  }
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
      <Icon icon={FileText} className="size-4" />
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function ListSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

async function invalidate(utils: ReturnType<typeof trpc.useUtils>): Promise<void> {
  await Promise.all([
    utils.trash.listAll.invalidate(),
    utils.trash.summary.invalidate(),
    utils.documents.list.invalidate(),
    utils.documents.count.invalidate(),
    utils.media.list.invalidate(),
  ]);
}
