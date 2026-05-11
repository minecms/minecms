import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Vite-конфиг `@minecms/ui`.
 *
 * Один файл обслуживает два режима:
 *   1. `vite build` — library mode для будущей публикации в npm. Внешние deps
 *      исключены, генерируется ESM-бандл `dist/index.mjs` и `dist/icons.mjs`.
 *   2. Storybook (`storybook dev` / `storybook build`) — обычный application
 *      mode без `lib` опций; нужны Tailwind v4 plugin, чтобы `@import "tailwindcss"`
 *      из `preview.tsx` собрался.
 *
 * Storybook 10 явно выставляет переменную `STORYBOOK=true` (см.
 * https://storybook.js.org/docs/builders/vite). По ней различаем режимы.
 */
const isStorybook = process.env.STORYBOOK === 'true';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: isStorybook
    ? undefined
    : {
        lib: {
          entry: {
            index: resolve(__dirname, 'src/index.ts'),
            icons: resolve(__dirname, 'src/icons.ts'),
          },
          formats: ['es'],
        },
        sourcemap: true,
        rollupOptions: {
          external: [
            'react',
            'react-dom',
            'react/jsx-runtime',
            /^@radix-ui\//,
            '@hugeicons/react',
            '@hugeicons/core-free-icons',
            'class-variance-authority',
            'clsx',
            'tailwind-merge',
          ],
        },
      },
});
