import type { SchemaDefinition, StudioStructurePane } from './types';

/**
 * Явная декларация панели сайдбара (удобно держать в `structure/index.ts` проекта).
 */
export function defineStudioStructure(pane: StudioStructurePane): StudioStructurePane {
  return pane;
}

/**
 * Проверяет, что все `kind: 'schema'` указывают на существующие схемы и нет дубликатов.
 */
export function validateStudioStructure(
  schemas: SchemaDefinition[],
  pane: StudioStructurePane,
): void {
  const names = new Set(schemas.map((s) => s.name));
  const usedInStructure = new Set<string>();

  if (!pane.title || typeof pane.title !== 'string' || !pane.title.trim()) {
    throw new Error('studioStructure.title must be a non-empty string.');
  }
  if (!Array.isArray(pane.items)) {
    throw new Error('studioStructure.items must be an array.');
  }

  for (const item of pane.items) {
    if (item.kind === 'divider') continue;
    if (item.kind === 'schema') {
      if (!item.name || typeof item.name !== 'string') {
        throw new Error('studioStructure: schema item must have a non-empty name.');
      }
      if (!names.has(item.name)) {
        throw new Error(
          `studioStructure: schema "${item.name}" is not in defineConfig({ schemas }).`,
        );
      }
      if (usedInStructure.has(item.name)) {
        throw new Error(`studioStructure: duplicate schema "${item.name}" in items.`);
      }
      usedInStructure.add(item.name);
    } else {
      throw new Error(`studioStructure: unknown item kind "${(item as { kind: string }).kind}".`);
    }
  }
}
