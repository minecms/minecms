import { type FastifyTRPCPluginOptions, fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import fp from 'fastify-plugin';
import type { ServerState } from '../state';
import { createContextFactory } from '../trpc/context';
import { type AppRouter, appRouter } from '../trpc/router';

/**
 * Монтирует tRPC под префиксом `/api/trpc`. Контекст создаётся из общего ServerState —
 * любая мутация `state.installationState`/`state.db` после `install.run` сразу
 * становится видна следующим запросам без рестарта процесса.
 */
export const trpcPlugin = fp(async (app, opts: { state: ServerState }) => {
  await app.register(fastifyTRPCPlugin<AppRouter>, {
    prefix: '/api/trpc',
    trpcOptions: {
      router: appRouter,
      createContext: createContextFactory(opts.state),
      onError({ path, error }) {
        opts.state.logger.error({ path, error }, 'tRPC error');
      },
    } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
  });
});
