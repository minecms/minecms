import { serializeSchema } from '../../schemas';
import { router } from '../core';
import { authenticatedProcedure } from '../middlewares';

/**
 * Копия контракта с сервера: панель сайдбара приходит JSON-ом из конфига пользователя.
 */
export type SerializedStudioStructurePane = {
  title: string;
  items: Array<{ kind: 'divider' } | { kind: 'schema'; name: string }>;
};

export const schemasRouter = router({
  /**
   * Отдаёт сериализованные пользовательские схемы и Studio-структуру сайдбара.
   *
   * Защищено `authenticatedProcedure`: схема контент-модели — внутренний
   * контракт между server и Studio, анонимному консьюменту он не нужен (для
   * него есть REST `/api/v1/:schema` с фильтром по `published`).
   */
  list: authenticatedProcedure.query(({ ctx }) => {
    const studioStructure: SerializedStudioStructurePane | null =
      ctx.state.userConfig?.config.studioStructure ?? null;
    return {
      schemas: ctx.state.userSchemas.map((schema) => serializeSchema(schema)),
      studioStructure,
    };
  }),
});
