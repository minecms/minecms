import { defineConfig } from 'tsup';

/**
 * Сборка `@minecms/server` для публикации в npm.
 *
 * Используем `bundle: false` — tsup просто транспилирует .ts→.js, не пытаясь
 * упаковать в один файл. Это критично, потому что сервер тянет нативные пакеты
 * (`mysql2`, `pg`, `@node-rs/argon2`, AWS SDK), которые лучше оставлять
 * внешними и резолвить через node_modules потребителя.
 */
export default defineConfig({
  entry: ['src/**/*.ts', '!src/**/*.test.ts'],
  format: ['esm'],
  target: 'node24',
  bundle: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
  outDir: 'dist',
  tsconfig: 'tsconfig.build.json',
});
