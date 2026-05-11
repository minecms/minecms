import cors from '@fastify/cors';
import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { ServerEnv } from '../config';

interface CorsPluginOptions {
  env: ServerEnv;
  /**
   * Origins, разрешённые из `minecms.config.ts` (`server.cors`).
   * Studio dev-origin (`http://HOST:5173`) добавляется автоматически.
   * Остальные потребители (например, публичный сайт-потребитель `@minecms/sdk`)
   * должны быть указаны разработчиком явно — это безопасный default.
   */
  userOrigins?: readonly string[];
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const API_PREFIX = '/api/';

/**
 * CORS для cross-origin запросов из Studio (Vite dev) и сайтов-потребителей,
 * использующих `@minecms/sdk`. Production: Studio раздаётся тем же server'ом,
 * сайты-потребители — отдельные домены, явно перечисленные в `server.cors`.
 *
 * Списки origins всегда непустые: Studio dev-origin есть всегда. Это даёт
 * стабильное поведение между dev и production без зависимости от `NODE_ENV`.
 *
 * Поверх CORS добавляется явная Origin-проверка на мутирующие методы (P1-15):
 * `SameSite=Lax` cookie блокирует cross-origin `<form>`-CSRF, но не редкие
 * случаи top-level navigation; явный allow-list по `Origin`/`Referer` —
 * defense-in-depth.
 */
export const corsPlugin = fp(async (app, opts: CorsPluginOptions) => {
  const studioDevOrigin = `http://${opts.env.HOST}:5173`;
  const studioDevAlt = `http://localhost:5173`;
  const userOrigins = opts.userOrigins ?? [];
  const origins = Array.from(new Set([studioDevOrigin, studioDevAlt, ...userOrigins]));

  await app.register(cors, {
    origin: origins,
    credentials: true,
  });

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!isApiMutation(req)) return;

    // Same-origin запрос (Studio раздаётся тем же server'ом в production) —
    // браузер не присылает `Origin`/`Referer` для same-origin GET, но для
    // POST/PUT/PATCH/DELETE присылает Origin почти всегда. Если ни Origin,
    // ни Referer не пришли — это либо same-origin (тогда `Host`-проверка
    // достаточна), либо запрос не из браузера (curl/SDK/integration tool).
    const origin = readOrigin(req);
    if (origin === null) {
      // SDK/integration через `@minecms/sdk` ходит без cookie, через REST —
      // и не доходит до мутирующих эндпоинтов: SDK по контракту read-only.
      // Запрос без Origin к мутирующему `/api/` — либо same-origin SPA
      // (где cookie уже привязана к домену), либо нелегитимный клиент.
      // Пропускаем: `SameSite=Lax` cookie всё равно не передастся cross-site.
      return;
    }

    if (!origins.includes(origin)) {
      reply.code(403).send({
        error: 'ORIGIN_NOT_ALLOWED',
        message: 'Origin запроса не входит в список разрешённых.',
      });
    }
  });
});

function isApiMutation(req: FastifyRequest): boolean {
  if (!req.url.startsWith(API_PREFIX)) return false;
  return MUTATING_METHODS.has(req.method.toUpperCase());
}

/**
 * Извлекает `Origin` из заголовков. Если его нет — fallback на `Referer`,
 * чтобы поймать редкие случаи (Safari иногда не присылает Origin на
 * top-level form submit). Возвращает только origin-часть (`scheme://host[:port]`).
 */
function readOrigin(req: FastifyRequest): string | null {
  const originHeader = req.headers.origin;
  if (typeof originHeader === 'string' && originHeader.length > 0) {
    return normalizeOrigin(originHeader);
  }
  const refererHeader = req.headers.referer;
  if (typeof refererHeader === 'string' && refererHeader.length > 0) {
    try {
      const parsed = new URL(refererHeader);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeOrigin(raw: string): string {
  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return raw;
  }
}
