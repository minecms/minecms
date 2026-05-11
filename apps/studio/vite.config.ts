import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Vite-конфиг Studio.
 *
 * - `@vitejs/plugin-react` — React 19 + Fast Refresh.
 * - `@tailwindcss/vite` — Tailwind v4 без отдельного PostCSS-конфига.
 * - `define` пробрасывает `MINECMS_DEV_MODE` в клиентский код через
 *   `import.meta.env.MINECMS_DEV_MODE`. Активируется командой
 *   `MINECMS_DEV_MODE=ui pnpm --filter @minecms/studio dev`.
 *
 * UI-dev-режим — это исключительно dev-инструмент для итерации по экранам Studio
 * без поднятого backend. В production-сборке (`vite build`) переменная не выставлена,
 * dev-обработчики tree-shake'ятся и не попадают в бандл.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // В real-режиме фронт ходит в backend по тем же origin'ам, чтобы cookie-сессия
      // не упиралась в CORS. Backend — на 3333 по умолчанию.
      '/api': {
        target: 'http://127.0.0.1:3333',
        changeOrigin: false,
        secure: false,
      },
    },
  },
  define: {
    'import.meta.env.MINECMS_DEV_MODE': JSON.stringify(process.env.MINECMS_DEV_MODE ?? ''),
  },
  build: {
    target: 'es2023',
    sourcemap: true,
    outDir: 'dist',
    emptyOutDir: true,
  },
});
