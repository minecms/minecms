import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';
import { buildMysqlUserTables, buildPostgresUserTables } from '../schemas';
import type { ServerState } from '../state';
import { createContextFactory } from './context';
import { appRouter } from './router';

function fakeState(installationState: 'pristine' | 'installed'): ServerState {
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
      installationState: 'pristine',
      installationFilePath: '/tmp/non-existent/installation.json',
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
    db: null,
    installationState,
    userConfig: null,
    userSchemas: [],
    userTables: {
      mysql: buildMysqlUserTables([]),
      postgres: buildPostgresUserTables([]),
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

describe('install-guard через tRPC роутер', () => {
  it('install.status доступен в pristine-режиме', async () => {
    const state = fakeState('pristine');
    const caller = appRouter.createCaller(
      createContextFactory(state)({ req: fakeReq, res: fakeRes, info: {} as never }),
    );
    const result = await caller.install.status();
    expect(result.state).toBe('pristine');
    expect(result.driver).toBeNull();
  });

  it('auth.me возвращает {user:null} в pristine — Studio покажет визард', async () => {
    const state = fakeState('pristine');
    const caller = appRouter.createCaller(
      createContextFactory(state)({ req: fakeReq, res: fakeRes, info: {} as never }),
    );
    const result = await caller.auth.me();
    expect(result.user).toBeNull();
  });

  it('auth.login блокируется в pristine-режиме (FORBIDDEN до установки)', async () => {
    const state = fakeState('pristine');
    const caller = appRouter.createCaller(
      createContextFactory(state)({ req: fakeReq, res: fakeRes, info: {} as never }),
    );
    await expect(
      caller.auth.login({ email: 'a@b.com', password: 'whatever1' }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it('после установки install.status показывает installed', async () => {
    const state = fakeState('installed');
    const caller = appRouter.createCaller(
      createContextFactory(state)({ req: fakeReq, res: fakeRes, info: {} as never }),
    );
    const result = await caller.install.status();
    expect(result.state).toBe('installed');
  });
});
