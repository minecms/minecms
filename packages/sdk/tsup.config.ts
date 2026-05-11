import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2023',
  dts: true,
  // Отдельный tsconfig только для tsup-сборки — см. комментарий в `packages/core/tsup.config.ts`.
  tsconfig: 'tsconfig.build.json',
  clean: true,
  sourcemap: true,
  treeshake: true,
});
