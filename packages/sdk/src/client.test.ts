import { defineField, defineSchema } from '@minecms/core';
import { describe, expect, it, vi } from 'vitest';
import { createClient } from './client';
import { MineCMSError } from './errors';

const pageSchema = defineSchema({
  name: 'page',
  routeField: 'slug',
  fields: {
    title: defineField.string({ label: 'Title' }),
    slug: defineField.slug({ label: 'Slug' }),
    body: defineField.text({ label: 'Body', optional: true }),
  },
});

const postSchema = defineSchema({
  name: 'post',
  fields: {
    title: defineField.string({ label: 'Title' }),
    published: defineField.boolean({ label: 'Published', default: false }),
  },
});

const SCHEMAS = { page: pageSchema, post: postSchema };

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

/** Достаёт пару `[url, init]` первого вызова мока, с проверкой что вызов был. */
function firstCall(mock: ReturnType<typeof vi.fn>): readonly [unknown, RequestInit | undefined] {
  const call = mock.mock.calls[0];
  if (!call) throw new Error('fetch mock не был вызван');
  return [call[0], call[1] as RequestInit | undefined];
}

describe('createClient: list', () => {
  it('строит правильный URL и пробрасывает limit/offset', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        items: [{ id: 1, title: 'Home', slug: 'home', body: null }],
        total: 1,
        limit: 10,
        offset: 0,
      }),
    );
    const cms = createClient({ url: 'http://localhost:3333', schemas: SCHEMAS, fetch: fetchMock });
    const result = await cms.page.list({ limit: 10, offset: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = firstCall(fetchMock);
    expect(url).toBe('http://localhost:3333/api/v1/page?limit=10&offset=0');
    expect(result.total).toBe(1);
    expect(result.items[0]?.title).toBe('Home');
  });

  it('убирает завершающий слеш из baseUrl и не дублирует /api/v1', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ items: [], total: 0, limit: 50, offset: 0 }),
    );
    const cms = createClient({
      url: 'http://localhost:3333///',
      schemas: SCHEMAS,
      fetch: fetchMock,
    });
    await cms.post.list();

    const [url] = firstCall(fetchMock);
    expect(url).toBe('http://localhost:3333/api/v1/post');
  });

  it('передаёт Authorization-токен и custom headers', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ items: [], total: 0, limit: 50, offset: 0 }),
    );
    const cms = createClient({
      url: 'http://localhost:3333',
      schemas: SCHEMAS,
      fetch: fetchMock,
      token: 'abc-secret',
      headers: { 'X-Tenant': 'demo' },
    });
    await cms.page.list();

    const [, init] = firstCall(fetchMock);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer abc-secret');
    expect(headers['X-Tenant']).toBe('demo');
  });
});

describe('createClient: get', () => {
  it('возвращает item из ответа', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ item: { id: 7, title: 'Главная', slug: 'home', body: 'hello' } }),
    );
    const cms = createClient({ url: 'http://localhost:3333', schemas: SCHEMAS, fetch: fetchMock });
    const home = await cms.page.get('home');

    const [url] = firstCall(fetchMock);
    expect(url).toBe('http://localhost:3333/api/v1/page/home');
    expect(home.title).toBe('Главная');
    expect(home.body).toBe('hello');
  });

  it('бросает MineCMSError при пустом slug', async () => {
    const fetchMock = vi.fn();
    const cms = createClient({ url: 'http://localhost:3333', schemas: SCHEMAS, fetch: fetchMock });
    await expect(cms.page.get('')).rejects.toBeInstanceOf(MineCMSError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('createClient: errors', () => {
  it('сериализует ошибку из тела ответа в MineCMSError', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: { message: 'NOT_FOUND', code: 'NOT_FOUND' } }, { status: 404 }),
    );
    const cms = createClient({ url: 'http://localhost:3333', schemas: SCHEMAS, fetch: fetchMock });
    try {
      await cms.page.get('nope');
      throw new Error('expected to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(MineCMSError);
      const e = err as MineCMSError;
      expect(e.status).toBe(404);
      expect(e.code).toBe('NOT_FOUND');
    }
  });

  it('парсит плоский error (формат REST @minecms/server)', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: 'TABLE_NOT_BUILT', schema: 'pages' }, { status: 500 }),
    );
    const cms = createClient({ url: 'http://localhost:3333', schemas: SCHEMAS, fetch: fetchMock });
    try {
      await cms.page.list();
      throw new Error('expected to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(MineCMSError);
      const e = err as MineCMSError;
      expect(e.status).toBe(500);
      expect(e.code).toBe('TABLE_NOT_BUILT');
      expect(e.message).toContain('pages');
    }
  });

  it('оборачивает network-ошибку в MineCMSError со status=0', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('connect ECONNREFUSED');
    });
    const cms = createClient({ url: 'http://localhost:3333', schemas: SCHEMAS, fetch: fetchMock });
    await expect(cms.page.list()).rejects.toMatchObject({ status: 0, code: 'NETWORK' });
  });
});

describe('createClient: окружение', () => {
  it('бросает понятную ошибку, если fetch не передан и недоступен глобально', () => {
    const original = (globalThis as { fetch?: typeof fetch }).fetch;
    Reflect.deleteProperty(globalThis, 'fetch');
    try {
      expect(() => createClient({ url: 'http://localhost:3333', schemas: SCHEMAS })).toThrow(
        /fetch.*недоступен/,
      );
    } finally {
      if (original !== undefined) {
        (globalThis as { fetch?: typeof fetch }).fetch = original;
      }
    }
  });
});
