import { publicProcedure, router } from './core';
import { authRouter } from './routers/auth';
import { documentsRouter } from './routers/documents';
import { installRouter } from './routers/install';
import { mediaRouter } from './routers/media';
import { schemasRouter } from './routers/schemas';
import { trashRouter } from './routers/trash';

/**
 * Корневой tRPC-роутер. До завершения установки разрешены только `install.*`
 * (они без `installRequired`-гарда). Всё остальное — после `installation_state = 'installed'`.
 *
 * `schemas.list` доступен публично — он отдаёт описание контент-моделей,
 * необходимое Studio для построения интерфейса до того, как пользователь зайдёт.
 * `documents.*` — за `dbProcedure`, требует завершённой установки и активного соединения.
 */
export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true, ts: Date.now() })),
  install: installRouter,
  auth: authRouter,
  schemas: schemasRouter,
  documents: documentsRouter,
  media: mediaRouter,
  trash: trashRouter,
});

export type AppRouter = typeof appRouter;
