import cookie from '@fastify/cookie';
import fp from 'fastify-plugin';
import type { ServerEnv } from '../config';

/**
 * Плагин cookie. Подпись cookies делается **на уровне tRPC** через `signValue`/`unsignValue`,
 * чтобы те же helper-ы можно было использовать в тестах без поднятого Fastify.
 * `@fastify/cookie` здесь нужен только для парсинга `req.cookies` и удобной установки
 * заголовков `Set-Cookie` через `res.setCookie`/`res.clearCookie`.
 */
export const cookiesPlugin = fp(async (app, _opts: { env: ServerEnv }) => {
  await app.register(cookie);
});
