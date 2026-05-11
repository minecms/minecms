import {
  Icon,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@minecms/ui';
import { Boxes, Moon, Settings, Sun, System } from '@minecms/ui/icons';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { trpc } from '../../shared/api/client';
import { getContentEntrySchemaName } from './content-entry-schema';
import { MobileNav } from './mobile-nav';
import { APP_SECTIONS, resolveActiveSection } from './sections-config';
import { Sidebar } from './sidebar';
import { useSidebarWheelTrap } from './use-sidebar-wheel-trap';

/**
 * Корневой лейаут Studio после прохождения логина: sidebar слева, topbar сверху,
 * scrollable content-area справа. Реализован классическим shadcn dashboard
 * паттерном на flex'е без табличной разметки — proxy для будущих breakpoint'ов.
 *
 * `secondary` — опциональный третий пейн между schema-sidebar'ом и main
 * (используется страницами schema для inline списка документов).
 */
export function AppShell(props: {
  children: React.ReactNode;
  secondary?: React.ReactNode;
}): React.JSX.Element {
  const pathname = useLocation({ select: (location) => location.pathname });
  const activeSection = resolveActiveSection(pathname);
  const showContentSidebar = activeSection.sidebar === 'content';

  return (
    // h-svh + overflow-hidden: оболочка = высота окна, скролл только в main.
    // Иначе flex-родитель растёт с контентом, overflow-y на main не срабатывает и скроллятся сайдбары.
    <div className="flex h-svh min-h-0 w-full flex-col overflow-hidden bg-background lg:flex-row">
      <MobileNav />
      <LeftRail />
      {showContentSidebar ? <Sidebar /> : null}
      {props.secondary ?? null}
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain bg-muted px-4 py-6 sm:px-8">
        <div className="mx-auto w-full max-w-6xl">{props.children}</div>
      </main>
    </div>
  );
}

function readStoredTheme(): 'system' | 'light' | 'dark' {
  if (typeof window === 'undefined') return 'system';
  const saved = window.localStorage.getItem('minecms-theme');
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  return 'system';
}

function LeftRail(): React.JSX.Element {
  const leftRailScrollRef = useRef<HTMLElement>(null);
  useSidebarWheelTrap(leftRailScrollRef);

  // Инициализация из localStorage синхронно: иначе первый useEffect с [theme]
  // успевает записать `system` и затирает сохранённую «light»/«dark» до чтения.
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(readStoredTheme);
  const schemasQuery = trpc.schemas.list.useQuery();
  const me = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      await navigate({ to: '/login' });
    },
  });
  const pathname = useLocation({ select: (l) => l.pathname });
  const contentEntry =
    schemasQuery.data !== undefined
      ? getContentEntrySchemaName({
          schemas: schemasQuery.data.schemas,
          studioStructure: schemasQuery.data.studioStructure,
        })
      : undefined;

  const homeNavActive = pathname.startsWith('/dashboard');
  const contentNavActive = pathname.startsWith('/schema/');
  const mediaNavActive = pathname.startsWith('/media');
  const trashNavActive = pathname.startsWith('/trash');

  const railLinkClass = (active: boolean) =>
    [
      'inline-flex h-10 w-10 items-center justify-center rounded-md transition-colors',
      'hover:bg-accent hover:text-foreground',
      active ? 'bg-accent text-foreground' : 'text-muted-foreground',
    ].join(' ');

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    if (theme === 'light') root.classList.add('light');
    if (theme === 'dark') root.classList.add('dark');
    window.localStorage.setItem('minecms-theme', theme);
  }, [theme]);

  return (
    <aside className="hidden min-h-0 w-16 shrink-0 flex-col overflow-hidden bg-card lg:flex">
      <header className="flex h-14 shrink-0 items-center justify-center border-b border-border">
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              aria-label="MineCMS"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground"
            >
              <Icon icon={Boxes} className="size-6" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="right">MineCMS</TooltipContent>
        </Tooltip>
      </header>
      <nav
        ref={leftRailScrollRef}
        className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto overscroll-y-contain py-3"
      >
        {APP_SECTIONS.map((section) => {
          if (section.id === 'home') {
            return (
              <Tooltip key={section.id}>
                <TooltipTrigger asChild>
                  <Link
                    to="/dashboard"
                    aria-label={section.label}
                    data-status={homeNavActive ? 'active' : undefined}
                    className={railLinkClass(homeNavActive)}
                  >
                    <Icon icon={section.icon} className="size-5" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{section.label}</TooltipContent>
              </Tooltip>
            );
          }

          if (section.id === 'content' && contentEntry) {
            return (
              <Tooltip key={section.id}>
                <TooltipTrigger asChild>
                  <Link
                    to="/schema/$schemaName"
                    params={{ schemaName: contentEntry }}
                    aria-label={section.label}
                    data-status={contentNavActive ? 'active' : undefined}
                    className={railLinkClass(contentNavActive)}
                  >
                    <Icon icon={section.icon} className="size-5" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{section.label}</TooltipContent>
              </Tooltip>
            );
          }

          if (section.id === 'media') {
            return (
              <Tooltip key={section.id}>
                <TooltipTrigger asChild>
                  <Link
                    to="/media"
                    aria-label={section.label}
                    data-status={mediaNavActive ? 'active' : undefined}
                    className={railLinkClass(mediaNavActive)}
                  >
                    <Icon icon={section.icon} className="size-5" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{section.label}</TooltipContent>
              </Tooltip>
            );
          }

          if (section.id === 'trash') {
            return (
              <Tooltip key={section.id}>
                <TooltipTrigger asChild>
                  <Link
                    to="/trash"
                    aria-label={section.label}
                    data-status={trashNavActive ? 'active' : undefined}
                    className={railLinkClass(trashNavActive)}
                  >
                    <Icon icon={section.icon} className="size-5" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{section.label}</TooltipContent>
              </Tooltip>
            );
          }

          return (
            <Tooltip key={section.id}>
              <TooltipTrigger asChild>
                <span
                  aria-label={`${section.label} недоступен: нет схем`}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground/50"
                >
                  <Icon icon={section.icon} className="size-5" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="right">{section.label} недоступен: нет схем</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
      <footer className="flex shrink-0 justify-center p-2">
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Профиль"
                  className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Icon icon={Settings} className="size-5" />
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="right">Профиль</TooltipContent>
          </Tooltip>
          <PopoverContent side="top" align="start" className="max-w-52 p-3">
            <p className="text-xs text-muted-foreground">Аккаунт</p>
            <p className="mt-1 truncate text-sm">{me.data?.user?.email ?? '—'}</p>
            <div className="mt-3 inline-flex w-full rounded-md border border-border bg-muted/60 p-0.5">
              <button
                type="button"
                title="Системная"
                className={`inline-flex h-8 flex-1 items-center justify-center rounded-sm transition-colors ${
                  theme === 'system' ? 'bg-background text-foreground' : 'text-muted-foreground'
                }`}
                onClick={() => setTheme('system')}
              >
                <Icon icon={System} className="size-4" />
              </button>
              <button
                type="button"
                title="Светлая"
                className={`inline-flex h-8 flex-1 items-center justify-center rounded-sm transition-colors ${
                  theme === 'light' ? 'bg-background text-foreground' : 'text-muted-foreground'
                }`}
                onClick={() => setTheme('light')}
              >
                <Icon icon={Sun} className="size-4" />
              </button>
              <button
                type="button"
                title="Тёмная"
                className={`inline-flex h-8 flex-1 items-center justify-center rounded-sm transition-colors ${
                  theme === 'dark' ? 'bg-background text-foreground' : 'text-muted-foreground'
                }`}
                onClick={() => setTheme('dark')}
              >
                <Icon icon={Moon} className="size-4" />
              </button>
            </div>
            <button
              type="button"
              className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-input px-3 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              disabled={logout.isPending}
              onClick={() => logout.mutate()}
            >
              Выйти
            </button>
          </PopoverContent>
        </Popover>
      </footer>
    </aside>
  );
}
