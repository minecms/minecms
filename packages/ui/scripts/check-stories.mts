#!/usr/bin/env tsx
/**
 * Проверка покрытия Stories.
 *
 * Падает с кодом 1, если нашёлся `src/components/<name>.tsx` без
 * соседнего `<name>.stories.tsx`. Подсказывает, как исправить.
 *
 * Используется в `pnpm --filter @minecms/ui storybook:check` и подключается
 * в общий гейт `pnpm typecheck && pnpm test && pnpm storybook:check`.
 */
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const COMPONENTS_DIR = resolve(__dirname, '..', 'src', 'components');

function main(): void {
  const files = readdirSync(COMPONENTS_DIR).filter(
    (f) => f.endsWith('.tsx') && !f.endsWith('.stories.tsx') && !f.endsWith('.test.tsx'),
  );

  const missing: string[] = [];
  for (const filename of files) {
    const baseName = filename.replace(/\.tsx$/, '');
    const storyPath = join(COMPONENTS_DIR, `${baseName}.stories.tsx`);
    if (!existsSync(storyPath)) missing.push(baseName);
  }

  if (missing.length === 0) {
    console.log(`OK: все ${files.length} компонентов покрыты stories.`);
    return;
  }

  console.error(`FAIL: ${missing.length} компонентов без stories:\n`);
  for (const name of missing) {
    console.error(`  - src/components/${name}.tsx → нет ${name}.stories.tsx`);
  }
  console.error('\nЧтобы создать недостающие stories автоматически, выполни:');
  console.error('  pnpm --filter @minecms/ui storybook:scaffold\n');
  process.exit(1);
}

main();
