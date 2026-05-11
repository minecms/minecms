/**
 * Vite-side ENV. Все значения известны на момент сборки и тип-безопасны.
 *
 * `MINECMS_DEV_MODE` пробрасывается из шелла через `vite.config.ts` → `define`.
 * В production-сборке переменная пустая, dev-обработчики tree-shake'ятся.
 */

const RAW_DEV_MODE = (import.meta.env.MINECMS_DEV_MODE ?? '') as string;

/** Активен ли UI-dev-режим: in-memory tRPC, без backend. */
export const isUiDevMode: boolean = RAW_DEV_MODE === 'ui';

/**
 * База URL для real-tRPC-транспорта. По умолчанию относительная — Vite-dev-proxy
 * перенаправит `/api` на backend (`http://127.0.0.1:3333`). В production
 * её можно переопределить через `VITE_API_BASE_URL`.
 */
export const apiBaseUrl: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';
