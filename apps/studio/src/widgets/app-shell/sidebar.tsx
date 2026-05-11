import { Divider, Icon, Skeleton } from '@minecms/ui';
import { ChevronLeft, ChevronRight, getIconByName } from '@minecms/ui/icons';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { trpc } from '../../shared/api/client';
import { STUDIO_CONTENT_SECTION_LABEL } from './sections-config';
import { useSidebarWheelTrap } from './use-sidebar-wheel-trap';

const COLLAPSED_KEY = 'minecms-sidebar-collapsed';

function compareSchemas(
  a: { name: string; order: number },
  b: { name: string; order: number },
): number {
  if (a.order !== b.order) return a.order - b.order;
  return a.name.localeCompare(b.name);
}

type StructureItem = { kind: 'divider' } | { kind: 'schema'; name: string };

function readCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(COLLAPSED_KEY) === '1';
}

/**
 * Вторая колонка навигации: либо по `studioStructure` из `minecms.config.ts`,
 * либо плоский список всех схем (по `order`).
 *
 * Поддерживает свёрнутое состояние: пользователь жмёт на кнопку в шапке —
 * колонка ужимается до узкой полосы с одной кнопкой «развернуть». Состояние
 * персистится в `localStorage`, чтобы не сбрасываться между сессиями.
 */
export function Sidebar(): React.JSX.Element {
  const navScrollRef = useRef<HTMLElement>(null);
  useSidebarWheelTrap(navScrollRef);

  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);

  useEffect(() => {
    window.localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  const schemas = trpc.schemas.list.useQuery();
  const schemasList = schemas.data?.schemas ?? [];
  const studioStructure = schemas.data?.studioStructure ?? null;

  const byName = useMemo(() => new Map(schemasList.map((s) => [s.name, s])), [schemasList]);

  const fallbackSorted = useMemo(
    () =>
      [...schemasList].sort((a, b) =>
        compareSchemas({ name: a.name, order: a.order }, { name: b.name, order: b.order }),
      ),
    [schemasList],
  );

  const sectionLabel = studioStructure?.title ?? STUDIO_CONTENT_SECTION_LABEL;

  if (collapsed) {
    return (
      <aside className="hidden min-h-0 w-10 shrink-0 flex-col overflow-hidden border-l border-border bg-card lg:flex">
        <header className="flex h-14 shrink-0 items-center justify-center border-b border-border px-1">
          <button
            type="button"
            title="Развернуть"
            aria-label="Развернуть боковую панель"
            aria-expanded="false"
            onClick={() => setCollapsed(false)}
            className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Icon icon={ChevronRight} className="size-4" />
          </button>
        </header>
      </aside>
    );
  }

  return (
    <aside className="hidden min-h-0 w-64 shrink-0 flex-col overflow-hidden border-l border-border bg-card lg:flex">
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <p className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {sectionLabel}
        </p>
        <button
          type="button"
          title="Свернуть"
          aria-label="Свернуть боковую панель"
          aria-expanded="true"
          onClick={() => setCollapsed(true)}
          className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Icon icon={ChevronLeft} className="size-4" />
        </button>
      </header>

      <nav
        ref={navScrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2 py-2"
      >
        {schemas.isLoading && (
          <>
            <Skeleton className="h-7 w-32" />
            <Skeleton className="mt-1 h-7 w-24" />
          </>
        )}
        {schemas.isError && (
          <p className="py-1.5 text-xs text-destructive">Не удалось загрузить схемы.</p>
        )}
        {studioStructure ? (
          <div className="flex w-full min-w-0 flex-col gap-0.5">
            {studioStructure.items.map((item: StructureItem, index) => {
              if (item.kind === 'divider') {
                return <Divider key={`div-${index}`} className="my-2" />;
              }
              const schema = byName.get(item.name);
              if (!schema) return null;
              const schemaIcon = getIconByName(schema.icon);
              return (
                <SchemaMenuItem
                  key={schema.name}
                  toSchemaName={schema.name}
                  label={schema.label}
                  expandable={!schema.singleton}
                  iconNode={
                    schemaIcon ? (
                      <Icon
                        icon={schemaIcon}
                        className="size-4 text-muted-foreground group-hover:text-foreground"
                      />
                    ) : null
                  }
                />
              );
            })}
          </div>
        ) : (
          <div className="flex w-full min-w-0 flex-col gap-0.5">
            {fallbackSorted.map((schema) => {
              const schemaIcon = getIconByName(schema.icon);
              return (
                <SchemaMenuItem
                  key={schema.name}
                  toSchemaName={schema.name}
                  label={schema.label}
                  expandable={!schema.singleton}
                  iconNode={
                    schemaIcon ? (
                      <Icon
                        icon={schemaIcon}
                        className="size-4 text-muted-foreground group-hover:text-foreground"
                      />
                    ) : null
                  }
                />
              );
            })}
          </div>
        )}
      </nav>
    </aside>
  );
}

function SchemaMenuItem(props: {
  toSchemaName: string;
  label: string;
  iconNode: ReactNode;
  expandable: boolean;
}): React.JSX.Element {
  return (
    <Link
      to="/schema/$schemaName"
      params={{ schemaName: props.toSchemaName }}
      className="group flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground data-[status=active]:bg-accent data-[status=active]:text-accent-foreground"
      activeProps={{ 'data-status': 'active' }}
    >
      {props.iconNode}
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
      {props.expandable ? (
        <Icon
          icon={ChevronRight}
          className="size-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground group-data-[status=active]:text-foreground"
        />
      ) : null}
    </Link>
  );
}
