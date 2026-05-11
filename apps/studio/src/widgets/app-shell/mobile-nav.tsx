import {
  Divider,
  Icon,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@minecms/ui';
import {
  Boxes,
  ChevronRight,
  Close,
  getIconByName,
  Moon,
  NavMenu,
  Settings,
  Sun,
  System,
} from '@minecms/ui/icons';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { trpc } from '../../shared/api/client';
import { APP_SECTIONS, STUDIO_CONTENT_SECTION_LABEL } from './sections-config';

const THEME_KEY = 'minecms-theme';

type Theme = 'system' | 'light' | 'dark';
type StructureItem = { kind: 'divider' } | { kind: 'schema'; name: string };

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const saved = window.localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  return 'system';
}

/**
 * Мобильная навигация Studio: топбар-полоска `h-14` с гамбургер-кнопкой,
 * по клику открывает drawer (`Sheet`) со всей структурой навигации —
 * секции, схемы и (для коллекций) список документов выбранной схемы.
 *
 * Видим только на breakpoint ниже `lg`. На `lg+` показываются обычные
 * сайдбары (LeftRail + Sidebar + DocumentListSidebar).
 */
export function MobileNav(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(readStoredTheme);
  const pathname = useLocation({ select: (l) => l.pathname });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    if (theme === 'light') root.classList.add('light');
    if (theme === 'dark') root.classList.add('dark');
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // Закрываем drawer при смене URL — иначе он висит поверх новой страницы.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3 lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label="Открыть меню"
            className="inline-flex size-10 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Icon icon={NavMenu} className="size-5" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-80">
          <SheetHeader>
            <div className="flex items-center gap-2">
              <span
                aria-label="MineCMS"
                className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground"
              >
                <Icon icon={Boxes} className="size-5" />
              </span>
              <SheetTitle>MineCMS</SheetTitle>
            </div>
            <SheetClose asChild>
              <button
                type="button"
                aria-label="Закрыть"
                className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Icon icon={Close} className="size-4" />
              </button>
            </SheetClose>
          </SheetHeader>
          <SheetDescription className="sr-only">
            Главная навигация Studio: разделы, схемы и документы.
          </SheetDescription>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <SectionsList pathname={pathname} />
            <Divider className="my-3" />
            <SchemasList />
          </div>
          <ThemeAndLogout theme={theme} onThemeChange={setTheme} />
        </SheetContent>
      </Sheet>

      <Link to="/dashboard" className="inline-flex items-center gap-2">
        <span
          aria-label="MineCMS"
          className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground"
        >
          <Icon icon={Boxes} className="size-5" />
        </span>
        <span className="text-sm font-semibold">MineCMS</span>
      </Link>

      <span aria-hidden="true" className="size-10" />
    </header>
  );
}

function SectionsList(props: { pathname: string }): React.JSX.Element {
  const schemasQuery = trpc.schemas.list.useQuery();
  const schemasList = schemasQuery.data?.schemas ?? [];
  const studioStructure = schemasQuery.data?.studioStructure ?? null;
  const fallbackEntry = schemasList[0]?.name;

  return (
    <nav aria-label="Разделы" className="flex flex-col gap-0.5">
      <p className="pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        Разделы
      </p>
      {APP_SECTIONS.map((section) => {
        const active = section.isActive(props.pathname);
        const className = `flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
          active ? 'bg-accent text-accent-foreground' : 'text-foreground/80'
        }`;
        const inner = (
          <>
            <Icon icon={section.icon} className="size-4" />
            <span className="min-w-0 flex-1 truncate">{section.label}</span>
          </>
        );

        if (section.id === 'home') {
          return (
            <Link key={section.id} to="/dashboard" className={className}>
              {inner}
            </Link>
          );
        }
        if (section.id === 'content') {
          const contentEntry = studioStructure
            ? (studioStructure.items.find(
                (i: StructureItem): i is { kind: 'schema'; name: string } => i.kind === 'schema',
              )?.name ?? fallbackEntry)
            : fallbackEntry;
          if (!contentEntry) {
            return (
              <span
                key={section.id}
                className="flex items-center gap-3 rounded-md px-2 py-2 text-sm text-muted-foreground/50"
              >
                {inner}
              </span>
            );
          }
          return (
            <Link
              key={section.id}
              to="/schema/$schemaName"
              params={{ schemaName: contentEntry }}
              className={className}
            >
              {inner}
            </Link>
          );
        }
        if (section.id === 'media') {
          return (
            <Link key={section.id} to="/media" className={className}>
              {inner}
            </Link>
          );
        }
        if (section.id === 'trash') {
          return (
            <Link key={section.id} to="/trash" className={className}>
              {inner}
            </Link>
          );
        }
        return null;
      })}
    </nav>
  );
}

function SchemasList(): React.JSX.Element | null {
  const schemasQuery = trpc.schemas.list.useQuery();
  const schemasList = schemasQuery.data?.schemas ?? [];
  const studioStructure = schemasQuery.data?.studioStructure ?? null;

  if (schemasList.length === 0) return null;

  const sorted = [...schemasList].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.name.localeCompare(b.name);
  });

  const items: Array<{ name: string; isDivider: false } | { isDivider: true; key: string }> = [];
  if (studioStructure) {
    studioStructure.items.forEach((item: StructureItem, index: number) => {
      if (item.kind === 'divider') {
        items.push({ isDivider: true, key: `div-${index}` });
        return;
      }
      if (schemasList.some((s) => s.name === item.name)) {
        items.push({ name: item.name, isDivider: false });
      }
    });
  } else {
    for (const s of sorted) items.push({ name: s.name, isDivider: false });
  }

  const byName = new Map(schemasList.map((s) => [s.name, s]));
  const label = studioStructure?.title ?? STUDIO_CONTENT_SECTION_LABEL;

  return (
    <nav aria-label={label} className="flex flex-col gap-0.5">
      <p className="pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      {items.map((item) => {
        if (item.isDivider) {
          return <Divider key={item.key} className="my-2" />;
        }
        const schema = byName.get(item.name);
        if (!schema) return null;
        const schemaIcon = getIconByName(schema.icon);
        return (
          <Link
            key={schema.name}
            to="/schema/$schemaName"
            params={{ schemaName: schema.name }}
            className="group flex items-center gap-3 rounded-md px-2 py-2 text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground data-[status=active]:bg-accent data-[status=active]:text-accent-foreground"
            activeProps={{ 'data-status': 'active' }}
          >
            {schemaIcon ? (
              <Icon
                icon={schemaIcon}
                className="size-4 text-muted-foreground group-hover:text-foreground"
              />
            ) : (
              <span className="size-4" />
            )}
            <span className="min-w-0 flex-1 truncate">{schema.label}</span>
            {!schema.singleton ? (
              <Icon
                icon={ChevronRight}
                className="size-3.5 shrink-0 text-muted-foreground/60 group-hover:text-foreground"
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function ThemeAndLogout(props: {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}): React.JSX.Element {
  const me = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      await navigate({ to: '/login' });
    },
  });

  return (
    <div className="shrink-0 border-t border-border bg-card px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-muted">
          <Icon icon={Settings} className="size-4 text-muted-foreground" />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm">{me.data?.user?.email ?? '—'}</p>
      </div>
      <div className="mt-3 inline-flex w-full rounded-md border border-border bg-muted/60 p-0.5">
        <ThemeButton
          active={props.theme === 'system'}
          onClick={() => props.onThemeChange('system')}
          label="Системная"
          icon={<Icon icon={System} className="size-4" />}
        />
        <ThemeButton
          active={props.theme === 'light'}
          onClick={() => props.onThemeChange('light')}
          label="Светлая"
          icon={<Icon icon={Sun} className="size-4" />}
        />
        <ThemeButton
          active={props.theme === 'dark'}
          onClick={() => props.onThemeChange('dark')}
          label="Тёмная"
          icon={<Icon icon={Moon} className="size-4" />}
        />
      </div>
      <button
        type="button"
        className="mt-3 inline-flex w-full cursor-pointer items-center justify-center rounded-md border border-input px-3 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        disabled={logout.isPending}
        onClick={() => logout.mutate()}
      >
        Выйти
      </button>
    </div>
  );
}

function ThemeButton(props: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      onClick={props.onClick}
      className={`inline-flex h-8 flex-1 cursor-pointer items-center justify-center rounded-sm transition-colors ${
        props.active ? 'bg-background text-foreground' : 'text-muted-foreground'
      }`}
    >
      {props.icon}
    </button>
  );
}
