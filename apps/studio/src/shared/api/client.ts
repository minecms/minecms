import type { AppRouter } from '@minecms/server';
import { createTRPCClient, type TRPCLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import { isUiDevMode } from '../lib/env';
import { createDevLink } from './transport-dev';
import { createRealLink } from './transport-real';

/**
 * Корневой tRPC-объект для React-Query-хуков. Импортирует `AppRouter` напрямую
 * из server-пакета — единственная связь Studio со server-runtime по типам.
 *
 * Используется так:
 *   const { data } = trpc.install.status.useQuery();
 *   const mutate = trpc.install.run.useMutation();
 */
export const trpc = createTRPCReact<AppRouter>();

/**
 * Vanilla-клиент (без React) — нужен для prefetch'а в роутерах TanStack Router
 * и для нерекативных вызовов из эффектов.
 */
export type AppTRPCClient = ReturnType<typeof createAppTRPCClient>;

export function createAppTRPCClient() {
  return createTRPCClient<AppRouter>({
    links: [resolveLink()],
  });
}

/**
 * Делает выбор между реальным HTTP-линком и in-memory dev-линком на основе
 * `MINECMS_DEV_MODE`. `isUiDevMode` инлайнится Vite через `define` в литерал
 * `false`/`true`, поэтому в production-сборке Rollup tree-shake'ит ветку с
 * dev-линком и весь его подграф (`./transport-dev`, `../../dev/*`).
 */
function resolveLink(): TRPCLink<AppRouter> {
  if (isUiDevMode) {
    return createDevLink<AppRouter>();
  }
  return createRealLink();
}
