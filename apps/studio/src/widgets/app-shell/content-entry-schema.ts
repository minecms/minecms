import type { SerializedSchema } from '../../entities/field-renderer';
import { NAVIGATION_SCHEMA_NAME } from './sections-config';

export type StudioStructureLike = {
  items: Array<{ kind: 'divider' } | { kind: 'schema'; name: string }>;
} | null;

/**
 * Первая ссылка в колонке «Контент» для левого рельса: как в `studioStructure`, иначе по `order`.
 */
export function getContentEntrySchemaName(data: {
  schemas: SerializedSchema[];
  studioStructure: StudioStructureLike;
}): string | undefined {
  if (data.studioStructure) {
    for (const item of data.studioStructure.items) {
      if (item.kind === 'schema' && item.name !== NAVIGATION_SCHEMA_NAME) return item.name;
    }
    return undefined;
  }
  const sorted = [...data.schemas].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.name.localeCompare(b.name);
  });
  return sorted.find((s) => s.name !== NAVIGATION_SCHEMA_NAME)?.name;
}
