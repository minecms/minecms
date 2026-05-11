import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Абсолютный путь до собранного Studio SPA. Используется сервером для отдачи
// статики через @fastify/static. Пакет публикуется с уже собранным `dist/`.
const here = dirname(fileURLToPath(import.meta.url));

/**
 * Папка с готовыми статическими ассетами Studio (index.html, assets/*).
 */
export const studioDistPath = resolve(here, '..', 'dist');

export default studioDistPath;
