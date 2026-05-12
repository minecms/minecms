import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Отдаёт production-бандл Studio из установленного пакета `@minecms/studio`
 * под префиксом `/admin`. Путь до `dist/` берётся через `import.meta.resolve`
 * (фолбэк — `require.resolve`), поэтому работает и при обычной установке через
 * pnpm/npm/yarn, и при симлинках pnpm.
 *
 * Если пакет не установлен — плагин логирует предупреждение и тихо пропускается,
 * чтобы голый бэкенд (без админки) тоже мог стартовать.
 */
async function studioPluginImpl(app: FastifyInstance): Promise<void> {
  const root = await resolveStudioDist();
  if (!root) {
    app.log.warn(
      '@minecms/studio не найден среди зависимостей — UI админки отключён, доступен только REST/tRPC API',
    );
    return;
  }

  await app.register(fastifyStatic, {
    root,
    prefix: '/admin/',
    wildcard: false,
  });

  // SPA-фолбэк: любые подпути /admin/* отдают index.html, чтобы клиентский
  // роутер TanStack Router мог разобрать URL на стороне браузера. Файлы из
  // `dist/assets/*` перехватывает @fastify/static выше (точные пути есть на диске).
  app.get('/admin', (_request, reply) => reply.sendFile('index.html', root));
  app.get('/admin/*', (_request, reply) => reply.sendFile('index.html', root));
}

async function resolveStudioDist(): Promise<string | null> {
  // Динамический строковый импорт через переменную, чтобы TypeScript не пытался
  // резолвить `@minecms/studio` статически: пакет является опциональной
  // зависимостью и может отсутствовать в production-сборке только-API.
  const moduleName = '@minecms/studio';
  try {
    const mod = (await import(moduleName)) as { studioDistPath?: string };
    return mod.studioDistPath ?? null;
  } catch {
    return null;
  }
}

export const studioPlugin = fp(studioPluginImpl, { name: 'minecms-studio' });
