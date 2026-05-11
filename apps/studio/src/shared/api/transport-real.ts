import { httpBatchLink } from '@trpc/client';
import { apiBaseUrl } from '../lib/env';

/**
 * Реальный транспорт tRPC: батчированный HTTP к `${apiBaseUrl}/trpc`.
 *
 * `credentials: 'include'` — обязательно, чтобы signed-cookie сессии
 * с backend подхватывались браузером (см. cookies.ts на сервере).
 */
export function createRealLink() {
  return httpBatchLink({
    url: `${apiBaseUrl}/trpc`,
    fetch(input, init) {
      const merged: RequestInit = { credentials: 'include' };
      if (init) Object.assign(merged, init);
      return fetch(input as RequestInfo, merged);
    },
  });
}
