import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadUserConfig } from './loader';

// Темп-директории создаём ВНУТРИ apps/server, иначе динамический import из temp
// не сможет резолвить `@minecms/core`: в os.tmpdir() нет node_modules с workspace-линками.
const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = join(here, '..', '..', '.tmp-tests-loader');

const VALID_CONFIG = `
import { defineConfig, defineSchema, defineField } from '@minecms/core';

const page = defineSchema({
  name: 'page',
  fields: {
    title: defineField.string({ label: 'Title' }),
    slug: defineField.slug({ label: 'Slug', source: 'title' }),
  },
  routeField: 'slug',
});

export default defineConfig({
  database: { driver: 'mysql' },
  schemas: [page],
  server: { port: 3333 },
});
`;

describe('loadUserConfig', () => {
  let cwd: string;

  beforeEach(() => {
    mkdirSync(FIXTURES_ROOT, { recursive: true });
    cwd = mkdtempSync(join(FIXTURES_ROOT, 'case-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('возвращает null, если конфига нет', async () => {
    const result = await loadUserConfig({ cwd });
    expect(result).toBeNull();
  });

  it('загружает minecms.config.ts через default-import', async () => {
    writeFileSync(join(cwd, 'minecms.config.ts'), VALID_CONFIG);
    const result = await loadUserConfig({ cwd });
    expect(result).not.toBeNull();
    expect(result?.schemas).toHaveLength(1);
    expect(result?.schemas[0]?.name).toBe('page');
    expect(result?.config.database.driver).toBe('mysql');
  });

  it('бросает на резервированном имени схемы (users)', async () => {
    const broken = `
import { defineConfig, defineSchema, defineField } from '@minecms/core';
const u = defineSchema({ name: 'users', fields: { x: defineField.string({ label: 'X' }) } });
export default defineConfig({ database: { driver: 'mysql' }, schemas: [u] });
`;
    writeFileSync(join(cwd, 'minecms.config.ts'), broken);
    await expect(loadUserConfig({ cwd })).rejects.toThrow(/занято системой/);
  });

  it('бросает, если default-export не похож на конфиг', async () => {
    writeFileSync(join(cwd, 'minecms.config.ts'), 'export default 42;');
    await expect(loadUserConfig({ cwd })).rejects.toThrow(/defineConfig/);
  });

  it('бросает, если указанный configPath не существует', async () => {
    await expect(loadUserConfig({ cwd, configPath: 'no-such-file.ts' })).rejects.toThrow(
      /Не найден файл/,
    );
  });

  it('бросает на двух схемах, нормализующихся в одно имя таблицы', async () => {
    const broken = `
import { defineConfig, defineSchema, defineField } from '@minecms/core';
const a = defineSchema({ name: 'my-page', fields: { x: defineField.string({ label: 'X' }) } });
const b = defineSchema({ name: 'my_page', fields: { y: defineField.string({ label: 'Y' }) } });
export default defineConfig({ database: { driver: 'mysql' }, schemas: [a, b] });
`;
    writeFileSync(join(cwd, 'minecms.config.ts'), broken);
    await expect(loadUserConfig({ cwd })).rejects.toThrow(/одно имя таблицы/);
  });
});
