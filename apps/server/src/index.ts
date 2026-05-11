import { createServer } from './server';

/**
 * Точка входа production/dev-режима. Поднимает Fastify на `HOST:PORT`,
 * корректно гасит процесс по SIGINT/SIGTERM (закрывает БД-пул + HTTP-server).
 */
async function main(): Promise<void> {
  const { app, state } = await createServer();
  const { HOST, PORT } = state.config.env;

  await app.listen({ host: HOST, port: PORT });

  const shutdown = async (signal: string): Promise<void> => {
    state.logger.info({ signal }, 'Останавливаем сервер');
    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      state.logger.error({ error }, 'Ошибка при остановке сервера');
      process.exit(1);
    }
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  // Логгер ещё может быть не поднят на этом этапе — пишем в stderr напрямую.
  console.error('Не удалось запустить @minecms/server:', error);
  process.exit(1);
});

export type { AppRouter } from './trpc/router';
