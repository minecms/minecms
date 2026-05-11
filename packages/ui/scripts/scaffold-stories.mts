#!/usr/bin/env tsx
/**
 * Скаффолдер stories для `@minecms/ui`.
 *
 * Алгоритм:
 *   1. Сканирует `src/components/*.tsx`.
 *   2. Для каждого файла без `*.stories.tsx`-соседа создаёт его по шаблону.
 *   3. Шаблон импортирует все именованные экспорты с заглавной буквы и
 *      создаёт `Default`-story для каждого.
 *
 * Запуск: `pnpm --filter @minecms/ui storybook:scaffold`.
 *
 * После генерации файлы можно дополнить руками — повторный запуск их не
 * перезапишет (см. `--force`).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const COMPONENTS_DIR = resolve(__dirname, '..', 'src', 'components');

const force = process.argv.includes('--force');

interface Detected {
  filename: string;
  componentNames: string[];
}

function detectComponents(filename: string): Detected | null {
  const filePath = join(COMPONENTS_DIR, filename);
  const source = readFileSync(filePath, 'utf8');
  const names = new Set<string>();

  // export function Foo(...) или export const Foo = ...
  const fnRegex = /export\s+(?:function|const|let|var)\s+([A-Z][A-Za-z0-9_]*)/g;
  for (const match of source.matchAll(fnRegex)) {
    if (match[1]) names.add(match[1]);
  }

  // export { Foo, Bar } — допишем агрегатные ре-экспорты
  const aggregateRegex = /export\s*\{\s*([^}]+)\s*\}/g;
  for (const match of source.matchAll(aggregateRegex)) {
    const list = match[1] ?? '';
    for (const part of list.split(',')) {
      const name = part.trim().split(/\s+as\s+/i).pop() ?? '';
      if (/^[A-Z]/.test(name)) names.add(name);
    }
  }

  if (names.size === 0) return null;
  return { filename, componentNames: [...names] };
}

function storyTemplate(component: Detected): string {
  const baseName = component.filename.replace(/\.tsx$/, '');
  const primary = component.componentNames[0] ?? capitalize(baseName);
  const importsLine = `import { ${component.componentNames.join(', ')} } from './${baseName}';`;

  const stories = component.componentNames
    .map((name) => {
      return `export const ${name}Default: Story = {\n  name: '${name}',\n  render: () => <${name}>${name}</${name}>,\n};`;
    })
    .join('\n\n');

  return `import type { Meta, StoryObj } from '@storybook/react-vite';
${importsLine}

/**
 * Stories автогенерированы скриптом \`storybook:scaffold\`. Дополняй здесь
 * пропсы, варианты, состояние disabled/loading и комбинации с другими
 * компонентами. Удалять файл нельзя — \`storybook:check\` упадёт.
 */
const meta: Meta<typeof ${primary}> = {
  title: 'Components/${capitalize(baseName)}',
  component: ${primary},
};

export default meta;
type Story = StoryObj<typeof ${primary}>;

${stories}
`;
}

function main(): void {
  const files = readdirSync(COMPONENTS_DIR).filter(
    (f) => f.endsWith('.tsx') && !f.endsWith('.stories.tsx') && !f.endsWith('.test.tsx'),
  );

  let created = 0;
  let skipped = 0;

  for (const filename of files) {
    const baseName = filename.replace(/\.tsx$/, '');
    const storyPath = join(COMPONENTS_DIR, `${baseName}.stories.tsx`);

    if (existsSync(storyPath) && !force) {
      skipped++;
      continue;
    }

    const detected = detectComponents(filename);
    if (!detected) {
      console.log(`[skip] ${filename}: компонентов с заглавной буквой не найдено`);
      continue;
    }

    if (!existsSync(dirname(storyPath))) mkdirSync(dirname(storyPath), { recursive: true });
    writeFileSync(storyPath, storyTemplate(detected), 'utf8');
    console.log(`[create] ${baseName}.stories.tsx → ${detected.componentNames.join(', ')}`);
    created++;
  }

  console.log(`\nГотово. Создано: ${created}, пропущено: ${skipped}.`);
}

function capitalize(s: string): string {
  return s
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

main();
