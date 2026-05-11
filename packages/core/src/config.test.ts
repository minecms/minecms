import { describe, expect, it } from 'vitest';
import { defineConfig } from './config';
import { defineField } from './field';
import { defineSchema } from './schema';

describe('defineConfig', () => {
  const page = defineSchema({
    name: 'page',
    fields: { title: defineField.string({ label: 'Title' }) },
  });

  it('создаёт валидный конфиг с MySQL', () => {
    const c = defineConfig({
      database: { driver: 'mysql' },
      schemas: [page],
    });
    expect(c.database.driver).toBe('mysql');
    expect(c.schemas).toHaveLength(1);
  });

  it('создаёт валидный конфиг с PostgreSQL и server-options', () => {
    const c = defineConfig({
      database: { driver: 'postgres', url: 'postgres://localhost/test' },
      schemas: [page],
      server: { port: 4000, cors: ['http://localhost:5173'] },
    });
    expect(c.server?.port).toBe(4000);
  });

  it('отклоняет studioStructure с неизвестной схемой', () => {
    const page = defineSchema({
      name: 'page',
      fields: { title: defineField.string({ label: 'Title' }) },
    });
    expect(() =>
      defineConfig({
        database: { driver: 'mysql' },
        schemas: [page],
        studioStructure: {
          title: 'Контент',
          items: [{ kind: 'schema', name: 'ghost' }],
        },
      }),
    ).toThrow(/ghost/);
  });

  it('падает на дубликате имён схем', () => {
    const a = defineSchema({
      name: 'duplicate',
      fields: { f: defineField.string({ label: 'F' }) },
    });
    const b = defineSchema({
      name: 'duplicate',
      fields: { g: defineField.string({ label: 'G' }) },
    });
    expect(() =>
      defineConfig({
        database: { driver: 'mysql' },
        schemas: [a, b],
      }),
    ).toThrow(/Duplicate schema names/);
  });
});
