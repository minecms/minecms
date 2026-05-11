import { describe, expect, it } from 'vitest';
import { defineField } from './field';
import { defineSchema } from './schema';
import { defineStudioStructure, validateStudioStructure } from './studio-structure';

describe('validateStudioStructure', () => {
  const home = defineSchema({
    name: 'home',
    singleton: true,
    fields: { t: defineField.string({ label: 'T' }) },
  });
  const page = defineSchema({
    name: 'page',
    fields: { t: defineField.string({ label: 'T' }) },
  });
  const schemas = [home, page];

  it('принимает валидную панель', () => {
    const pane = defineStudioStructure({
      title: 'Контент',
      items: [
        { kind: 'schema', name: 'home' },
        { kind: 'schema', name: 'page' },
        { kind: 'divider' },
      ],
    });
    expect(() => validateStudioStructure(schemas, pane)).not.toThrow();
  });

  it('отклоняет неизвестную схему', () => {
    expect(() =>
      validateStudioStructure(schemas, {
        title: 'X',
        items: [{ kind: 'schema', name: 'ghost' }],
      }),
    ).toThrow(/ghost/);
  });

  it('отклоняет дубликат schema в списке', () => {
    expect(() =>
      validateStudioStructure(schemas, {
        title: 'X',
        items: [
          { kind: 'schema', name: 'page' },
          { kind: 'schema', name: 'page' },
        ],
      }),
    ).toThrow(/duplicate/);
  });
});
