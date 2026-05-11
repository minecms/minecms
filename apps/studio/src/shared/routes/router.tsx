import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { DashboardPage } from '../../pages/dashboard/dashboard.page';
import { InstallPage } from '../../pages/install/install.page';
import { LoginPage } from '../../pages/login/login.page';
import { MediaPage } from '../../pages/media/media.page';
import { SchemaEditPage } from '../../pages/schema/edit.page';
import { SchemaIndexPage } from '../../pages/schema/index.page';
import { SchemaNewPage } from '../../pages/schema/new.page';
import { SchemaLayout } from '../../pages/schema/schema-layout';
import { TrashPage } from '../../pages/trash/trash.page';
import { ErrorScreen } from '../../widgets/error-screen/error-screen';
import { createAppTRPCClient } from '../api/client';
import { isUiDevMode } from '../lib/env';

/**
 * Singleton-клиент для использования в `beforeLoad`-хуках роутера. tRPC-клиент
 * не требует React-контекста для обычных вызовов — этим пользуемся в guard'ах.
 */
const guardClient = createAppTRPCClient();

/**
 * Гард: пускает только если установка уже завершена. Используется на /login —
 * до прохождения визарда форма входа не имеет смысла, редиректим на /install.
 *
 * В UI-dev-режиме гард тоже работает: dev-state стартует в `pristine`, после
 * прохождения визарда переходит в `installed` — поведение зеркально real-режиму.
 */
async function requireInstalled(): Promise<void> {
  const status = await guardClient.install.status.query();
  if (status.state !== 'installed') {
    throw redirect({ to: '/install' });
  }
}

/**
 * Гард приватных страниц: проверяет, что CMS установлена и пользователь
 * авторизован. Иначе — редирект на /install или /login. Гостевой режим в
 * Studio не предусмотрен: вся админка только для авторизованных.
 */
async function requireAuth(): Promise<void> {
  const status = await guardClient.install.status.query();
  if (status.state !== 'installed') {
    throw redirect({ to: '/install' });
  }
  const me = await guardClient.auth.me.query();
  if (!me.user) {
    throw redirect({ to: '/login' });
  }
}

/**
 * Обратный гард: если установка уже пройдена, не пускать пользователя обратно
 * на визард — это легитимная защита от случайной повторной установки.
 */
async function rejectIfInstalled(): Promise<void> {
  const status = await guardClient.install.status.query();
  if (status.state === 'installed') {
    throw redirect({ to: '/login' });
  }
}

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  errorComponent: ({ error, reset }) => <ErrorScreen error={error} reset={reset} />,
  notFoundComponent: () => (
    <ErrorScreen error={new Error('not found: запрошенный маршрут не существует')} />
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async () => {
    const status = await guardClient.install.status.query();
    if (status.state !== 'installed') {
      throw redirect({ to: '/install' });
    }
    throw redirect({ to: '/dashboard' });
  },
  component: () => null,
});

const installRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/install',
  beforeLoad: rejectIfInstalled,
  component: InstallPage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  beforeLoad: requireInstalled,
  component: LoginPage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  beforeLoad: requireAuth,
  component: DashboardPage,
});

const schemaLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/schema/$schemaName',
  beforeLoad: requireAuth,
  component: SchemaLayout,
});

const schemaIndexRoute = createRoute({
  getParentRoute: () => schemaLayoutRoute,
  path: '/',
  component: SchemaIndexPage,
});

const schemaNewRoute = createRoute({
  getParentRoute: () => schemaLayoutRoute,
  path: 'new',
  component: SchemaNewPage,
});

const schemaEditRoute = createRoute({
  getParentRoute: () => schemaLayoutRoute,
  path: '$documentId',
  component: SchemaEditPage,
});

const mediaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/media',
  beforeLoad: requireAuth,
  component: MediaPage,
});

const trashRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trash',
  beforeLoad: requireAuth,
  component: TrashPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  installRoute,
  loginRoute,
  dashboardRoute,
  schemaLayoutRoute.addChildren([schemaIndexRoute, schemaNewRoute, schemaEditRoute]),
  mediaRoute,
  trashRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  // В UI-dev режиме — короче, чтобы итерация по экранам шла без задержек.
  defaultStaleTime: isUiDevMode ? 0 : 30_000,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
