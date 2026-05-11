import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { corsPlugin } from './cors';

const ENV_BASE = {
  NODE_ENV: 'test' as const,
  PORT: 3333,
  HOST: '127.0.0.1',
  LOG_LEVEL: 'silent' as const,
  SESSION_SECRET: 'a'.repeat(64),
  MINECMS_AUTO_MIGRATE: false,
  MINECMS_ALLOW_DATA_LOSS: false,
  S3_FORCE_PATH_STYLE: undefined,
  S3_KEY_PREFIX: 'media',
  MEDIA_MAX_FILE_SIZE: 25 * 1024 * 1024,
};

describe('CORS plugin · origin-check на мутирующих /api/* запросах', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(corsPlugin, {
      env: ENV_BASE,
      userOrigins: ['https://app.example.com'],
    });
    // Минимальный echo-эндпоинт, чтобы было что вызывать после прохождения hook.
    app.post('/api/echo', async () => ({ ok: true }));
    app.get('/api/echo', async () => ({ ok: true, get: true }));
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST с разрешённым Origin → 200', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/echo',
      headers: { origin: 'https://app.example.com' },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
  });

  it('POST с Studio dev-origin → 200 (всегда в allow-list)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/echo',
      headers: { origin: 'http://127.0.0.1:5173' },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
  });

  it('POST с чужого Origin → 403 ORIGIN_NOT_ALLOWED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/echo',
      headers: { origin: 'https://evil.example.com' },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('POST без Origin/Referer → 200 (same-origin / non-browser)', async () => {
    // SameSite=Lax cookie всё равно не передастся cross-site; запросы без
    // Origin обычно идут от curl/SDK или same-origin SPA — пускаем.
    const res = await app.inject({ method: 'POST', url: '/api/echo', payload: {} });
    expect(res.statusCode).toBe(200);
  });

  it('GET с чужого Origin → 200 (origin-check только для мутаций)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/echo',
      headers: { origin: 'https://evil.example.com' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('DELETE с чужого Origin → 403', async () => {
    app.delete('/api/echo', async () => ({ ok: true }));
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/echo',
      headers: { origin: 'https://evil.example.com' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('PATCH с Referer на разрешённый origin → 200', async () => {
    app.patch('/api/echo', async () => ({ ok: true }));
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/echo',
      headers: { referer: 'https://app.example.com/some/page' },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
  });

  it('POST на не-/api/ путь не проверяется (только tRPC/REST под /api/)', async () => {
    app.post('/other', async () => ({ ok: true }));
    const res = await app.inject({
      method: 'POST',
      url: '/other',
      headers: { origin: 'https://evil.example.com' },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
  });
});
