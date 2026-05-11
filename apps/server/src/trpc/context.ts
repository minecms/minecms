import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import type { ServerState } from '../state';

/**
 * Контекст tRPC. Прокидывается в каждый procedure через `ctx`.
 * Содержит изменяемое `state` (через ссылку), HTTP req/res и cookie-helper'ы Fastify.
 *
 * Поля `user` и `sessionId` заполняются `loadSession`-middleware (см. `middlewares.ts`).
 * До middleware значения `undefined` — это сигнал «процедура не требует AuthN».
 * После middleware:
 *   - `user` + `sessionId` валидны (если процедура за `authenticatedProcedure`),
 *   - либо middleware кидает `UNAUTHORIZED` и до handler'а дело не доходит.
 */
export interface TrpcContext {
  state: ServerState;
  req: CreateFastifyContextOptions['req'];
  res: CreateFastifyContextOptions['res'];
}

export function createContextFactory(state: ServerState) {
  return ({ req, res }: CreateFastifyContextOptions): TrpcContext => ({
    state,
    req,
    res,
  });
}
