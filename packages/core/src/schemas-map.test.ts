import { describe, expect, it } from 'vitest';
import { defineField } from './field';
import { defineSchema } from './schema';
import { schemasToSdkMap } from './schemas-map';

describe('schemasToSdkMap', () => {
  it('строит карту по schema.name', () => {
    const a = defineSchema({
      name: 'page',
      fields: { title: defineField.string({ label: 'T' }) },
    });
    const b = defineSchema({
      type: 'post',
      fields: { title: defineField.string({ label: 'T' }) },
    });
    const map = schemasToSdkMap([a, b] as const);
    expect(map.page).toBe(a);
    expect(map.post).toBe(b);
  });

  it('падает при дубликате name', () => {
    const a = defineSchema({
      name: 'x',
      fields: { u: defineField.string({ label: 'U' }) },
    });
    const b = defineSchema({
      name: 'x',
      fields: { v: defineField.string({ label: 'V' }) },
    });
    expect(() => schemasToSdkMap([a, b])).toThrow(/duplicate schema name/);
  });
});
