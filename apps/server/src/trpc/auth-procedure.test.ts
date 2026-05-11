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
  fields: { title: defineField.string({ label: 'Title' }) },
});

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

/**
 * Раньше `documents.*`, `media.*`, `schemas.list` были на `dbProcedure` —
 * любой анонимный запрос проходил и получал/менял данные. После P0-01 они
 * перенесены на `authenticatedProcedure` и без валидной cookie должны
 * отдавать `UNAUTHORIZED`. Тесты ниже фиксируют это поведение как
 * долгосрочный контракт.
 */
describe('authenticatedProcedure: анонимный доступ заблокирован', () => {
  it('documents.list без сессии → UNAUTHORIZED', async () => {
    vi.mocked(loadSessionPrincipal).mockResolvedValue(null);
    const caller = appRouter.createCaller(
      createContextFactory(fakeState())({ req: fakeReq, res: fakeRes, info: {} as never }),
    );
    await expect(caller.documents.list({ schema: 'page' })).rejects.toBeInstanceOf(TRPCError);
  });

  it('documents.count без сессии → UNAUTHORIZED', async () => {
    vi.mocked(loadSessionPrincipal).mockResolvedValue(null);
    const caller = appRouter.createCaller(
      createContextFactory(fakeState())({ req: fakeReq, res: fakeRes, info: {} as never }),
    );
    await expect(caller.documents.count({ schema: 'page' })).rejects.toBeInstanceOf(TRPCError);
  });

  it('documents.delete без сессии → UNAUTHORIZED', async () => {
    vi.mocked(loadSessionPrincipal).mockResolvedValue(null);
    const caller = appRouter.createCaller(
      createContextFactory(fakeState())({ req: fakeReq, res: fakeRes, info: {} as never }),
    );
    await expect(caller.documents.delete({ schema: 'page', id: 1 })).rejects.toBeInstanceOf(
      TRPCError,
    );
  });

  it('documents.create без сессии → UNAUTHORIZED', async () => {
    vi.mocked(loadSessionPrincipal).mockResolvedValue(null);
    const caller = appRouter.createCaller(
      createContextFactory(fakeState())({ req: fakeReq, res: fakeRes, info: {} as never }),
    );
    await expect(
      caller.documents.create({ schema: 'page', data: { title: 'X' } }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it('media.list без сессии → UNAUTHORIZED', async () => {
    vi.mocked(loadSessionPrincipal).mockResolvedValue(null);
    const caller = appRouter.createCaller(
      createContextFactory(fakeState())({ req: fakeReq, res: fakeRes, info: {} as never }),
    );
    await expect(caller.media.list({})).rejects.toBeInstanceOf(TRPCError);
  });

  it('media.delete без сессии → UNAUTHORIZED', async () => {
    vi.mocked(loadSessionPrincipal).mockResolvedValue(null);
    const caller = appRouter.createCaller(
      createContextFactory(fakeState())({ req: fakeReq, res: fakeRes, info: {} as never }),
    );
    await expect(caller.media.delete({ id: 1 })).rejects.toBeInstanceOf(TRPCError);
  });

  it('schemas.list без сессии → UNAUTHORIZED', async () => {
    vi.mocked(loadSessionPrincipal).mockResolvedValue(null);
    const caller = appRouter.createCaller(
      createContextFactory(fakeState())({ req: fakeReq, res: fakeRes, info: {} as never }),
    );
    await expect(caller.schemas.list()).rejects.toBeInstanceOf(TRPCError);
  });

  it('trash.summary без сессии → UNAUTHORIZED', async () => {
    vi.mocked(loadSessionPrincipal).mockResolvedValue(null);
    const caller = appRouter.createCaller(
      createContextFactory(fakeState())({ req: fakeReq, res: fakeRes, info: {} as never }),
    );
    await expect(caller.trash.summary()).rejects.toBeInstanceOf(TRPCError);
  });

  it('trash.purgeDocument без сессии → UNAUTHORIZED', async () => {
    vi.mocked(loadSessionPrincipal).mockResolvedValue(null);
    const caller = appRouter.createCaller(
      createContextFactory(fakeState())({ req: fakeReq, res: fakeRes, info: {} as never }),
    );
    await expect(
      caller.trash.purgeDocument({ section: 'documents', schema: 'page', id: 1 }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it('trash.purgeMedia без сессии → UNAUTHORIZED', async () => {
    vi.mocked(loadSessionPrincipal).mockResolvedValue(null);
    const caller = appRouter.createCaller(
      createContextFactory(fakeState())({ req: fakeReq, res: fakeRes, info: {} as never }),
    );
    await expect(caller.trash.purgeMedia({ section: 'media', id: 1 })).rejects.toBeInstanceOf(
      TRPCError,
    );
  });

  it('UNAUTHORIZED имеет код "UNAUTHORIZED" (не FORBIDDEN, не INTERNAL)', async () => {
    vi.mocked(loadSessionPrincipal).mockResolvedValue(null);
    const caller = appRouter.createCaller(
      createContextFactory(fakeState())({ req: fakeReq, res: fakeRes, info: {} as never }),
    );
    try {
      await caller.documents.list({ schema: 'page' });
      throw new Error('должно было упасть');
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe('UNAUTHORIZED');
    }
  });
});

describe('authenticatedProcedure: публичные процедуры остаются доступными', () => {
  it('install.status без сессии работает (publicProcedure)', async () => {
    vi.mocked(loadSessionPrincipal).mockResolvedValue(null);
    const caller = appRouter.createCaller(
      createContextFactory(fakeState())({ req: fakeReq, res: fakeRes, info: {} as never }),
    );
    const result = await caller.install.status();
    expect(result.state).toBe('installed');
  });

  it('auth.me без сессии отдаёт {user: null} (publicProcedure)', async () => {
    vi.mocked(loadSessionPrincipal).mockResolvedValue(null);
    const caller = appRouter.createCaller(
      createContextFactory(fakeState())({ req: fakeReq, res: fakeRes, info: {} as never }),
    );
    const result = await caller.auth.me();
    expect(result.user).toBeNull();
  });

  it('health без сессии работает (publicProcedure)', async () => {
    vi.mocked(loadSessionPrincipal).mockResolvedValue(null);
    const caller = appRouter.createCaller(
      createContextFactory(fakeState())({ req: fakeReq, res: fakeRes, info: {} as never }),
    );
    const result = await caller.health();
    expect(result.ok).toBe(true);
  });
});

describe('authenticatedProcedure: с валидной сессией проходит до handler', () => {
  it('schemas.list с принципалом возвращает schemas', async () => {
    vi.mocked(loadSessionPrincipal).mockResolvedValue(validPrincipal);
    const caller = appRouter.createCaller(
      createContextFactory(fakeState())({ req: fakeReq, res: fakeRes, info: {} as never }),
    );
    const result = await caller.schemas.list();
    expect(result.schemas).toHaveLength(1);
    expect(result.schemas[0]?.name).toBe('page');
  });
});
