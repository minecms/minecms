/**
 * Абсолютный путь до папки с собранными статическими ассетами Studio.
 *
 * Используется на сервере для регистрации `@fastify/static`:
 *
 * ```ts
 * import { studioDistPath } from '@minecms/studio';
 * import fastifyStatic from '@fastify/static';
 *
 * await app.register(fastifyStatic, { root: studioDistPath, prefix: '/' });
 * ```
 */
export declare const studioDistPath: string;
export default studioDistPath;
