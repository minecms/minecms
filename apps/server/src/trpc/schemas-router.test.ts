import { defineField, defineSchema } from '@minecms/core';
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSessionPrincipal, type SessionPrincipal } from '../auth/session-loader';
import type { MineDb } from '../db';
import { buildMysqlUserTables, buildPostgresUserTables } from '../schemas';
import type { ServerState } from '../state';
import { createContextFactory } from './context';
import { appRouter } from './router';

vi.mock('../auth/session-loader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth/session-loader')>();
  return {
    ...actual,
    loadSessionPrincipal: vi.fn(),
  };
});

const page = defineSchema({
  name: 'page',
  label: 'Страница',
  icon: 'Home01Icon',
  fields: {
    title: defineField.string({ label: 'Title', max: 200 }),
    slug: defineField.slug({ label: 'Slug' }),
  },
  routeField: 'slug',
});

/**
 * Минимальный фейк `MineDb`. `authenticatedProcedure` сначала проходит через
 * `dbProcedure` — он только проверяет `state.db !== null`, реальный driver не
 * запрашивает. Конкретные select'ы по сессии заменены мокой выше.
 */
const fakeDb = {
  kind: 'mysql',
  driver: 'mysql',
  db: {} as never,
  schema: {} as never,
  close: async () => undefined,
  runMigrations: async () => undefined,
} as unknown as MineDb;

function fakeState(): ServerState {
  return {
    config: {
      env: {
        NODE_ENV: 'test',
        PORT: 3333,
        HOST: '127.0.0.1',
        LOG_LEVEL: 'silent',
        SESSION_SECRET: 'a'.repeat(64),
        MINECMS_AUTO_MIGRATE: false,
        MINECMS_ALLOW_DATA_LOSS: false,
        S3_FORCE_PATH_STYLE: undefined,
        S3_KEY_PREFIX: 'media',
        MEDIA_MAX_FILE_SIZE: 25 * 1024 * 1024,
      },
      database: null,
      installationState: 'installed',
      installationFilePath: '/tmp/none/installation.json',
      storage: null,
    },
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
      trace: () => undefined,
      fatal: () => undefined,
      level: 'silent',
    } as unknown as ServerState['logger'],
    db: fakeDb,
    installationState: 'installed',
    userConfig: null,
    userSchemas: [page],
    userTables: {
      mysql: buildMysqlUserTables([page]),
      postgres: buildPostgresUserTables([page]),
    },
    storage: null,
  };
}

const fakeReq = { cookies: {} } as unknown as Parameters<
  ReturnType<typeof createContextFactory>
>[0]['req'];
const fakeRes = {
  setCookie: () => undefined,
  clearCookie: () => undefined,
} as unknown as Parameters<ReturnType<typeof createContextFactory>>[0]['res'];

const validPrincipal: SessionPrincipal = {
  user: { id: 1, email: 'admin@example.com', role: 'admin' },
  sessionId: 'sess-test',
  expiresAt: new Date(Date.now() + 60_000),
};

beforeEach(() => {
  vi.mocked(loadSessionPrincipal).mockReset();
});

describe('schemas.list через tRPC за authenticatedProcedure', () => {
  it('без сессии → UNAUTHORIZED', async () => {
    vi.mocked(loadSessionPrincipal).mockResolvedValue(null);
    const caller = appRouter.createCaller(
      createContextFactory(fakeState())({ req: fakeReq, res: fakeRes, info: {} as never }),
    );
    await expect(caller.schemas.list()).rejects.toBeInstanceOf(TRPCError);
  });

  it('с валидной сессией отдаёт сериализованный список схем', async () => {
    vi.mocked(loadSessionPrincipal).mockResolvedValue(validPrincipal);
    const caller = appRouter.createCaller(
      createContextFactory(fakeState())({ req: fakeReq, res: fakeRes, info: {} as never }),
    );
    const result = await caller.schemas.list();
    expect(result.schemas).toHaveLength(1);
    expect(result.schemas[0]?.name).toBe('page');
    expect(result.schemas[0]?.label).toBe('Страница');
    expect(result.schemas[0]?.icon).toBe('Home01Icon');
    expect(result.schemas[0]?.type).toBe('page');
    expect(result.schemas[0]?.singleton).toBe(false);
    expect(result.schemas[0]?.routeField).toBe('slug');
    expect(result.studioStructure).toBeNull();
    expect(Object.keys(result.schemas[0]?.fields ?? {})).toEqual(['title', 'slug']);
  });
});
