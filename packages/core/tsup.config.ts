import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2023',
  dts: true,
  // Отдельный tsconfig только для tsup-сборки: содержит `ignoreDeprecations: "6.0"`,
  // потому что rollup-plugin-dts (внутри tsup) инжектит deprecated `baseUrl`.
  // Базовый `tsconfig.base.json` оставляем чистым — иначе IDE-language-server
  // (TS 5.x) ругается «Недопустимое значение для --ignoreDeprecations».
  tsconfig: 'tsconfig.build.json',
  clean: true,
  sourcemap: true,
  treeshake: true,
});
