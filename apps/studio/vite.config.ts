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
    // Ручное разбиение на чанки, чтобы initial-bundle не был 6+ МБ.
    // Vite 8 использует rolldown — формат `output.manualChunks` совместим
    // с rollup-style контрактом.
    rollupOptions: {
      output: {
        manualChunks(id: string): string | undefined {
          if (!id.includes('node_modules')) return undefined;
          // `@hugeicons/core-free-icons` намеренно отдаём rolldown'у на
          // авто-чанкование: статические named imports попадут в общий
          // chunk вместе с потребителем, а тяжёлый namespace из
          // `getIconByName` уйдёт в отдельный async-chunk.
          if (id.includes('/@hugeicons/')) return undefined;
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/'))
            return 'react';
          if (id.includes('/@tanstack/')) return 'tanstack';
          if (id.includes('/@tiptap/') || id.includes('/prosemirror-')) return 'tiptap';
          if (id.includes('/@radix-ui/')) return 'radix';
          if (id.includes('/@trpc/')) return 'trpc';
          if (id.includes('/lucide-react/')) return 'icons';
          if (id.includes('/zod/')) return 'zod';
          return 'vendor';
        },
      },
    },
    // Уровень предупреждения «слишком большой чанк» поднимаем до 6 МБ —
    // barrel `@hugeicons/core-free-icons` сам по себе ~5 МБ и не tree-shake'ится;
    // выпиливание hugeicons — отдельная фаза. Остальные чанки укладываются в ~160 кБ.
    chunkSizeWarningLimit: 6000,
  },
});
