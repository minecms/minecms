import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TRPCError } from '@trpc/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureInstallToken } from '../install-token';
import { buildMysqlUserTables, buildPostgresUserTables } from '../schemas';
import type { ServerState } from '../state';
import { createContextFactory } from './context';
import { appRouter } from './router';

function fakeState(opts: {
  installationState: 'pristine' | 'installed';
  installationFilePath: string;
}): ServerState {
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
      installationState: opts.installationState,
      installationFilePath: opts.installationFilePath,
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
    installationState: opts.installationState,
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

describe('install router · защита токеном', () => {
  let tmpDir: string;
  let installationFilePath: string;
  let tokenFilePath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'minecms-install-'));
    installationFilePath = join(tmpDir, 'installation.json');
    tokenFilePath = join(tmpDir, 'install.token');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('install.testDatabase без installToken → Zod-ошибка', async () => {
    ensureInstallToken(tokenFilePath);
    const state = fakeState({ installationState: 'pristine', installationFilePath });
    const caller = appRouter.createCaller(
      createContextFactory(state)({ req: fakeReq, res: fakeRes, info: {} as never }),
    );
    // @ts-expect-error — намеренно без поля installToken
    await expect(caller.install.testDatabase({ driver: 'mysql', url: 'x' })).rejects.toBeTruthy();
  });

  it('install.testDatabase с битым installToken → UNAUTHORIZED', async () => {
    ensureInstallToken(tokenFilePath);
    const state = fakeState({ installationState: 'pristine', installationFilePath });
    const caller = appRouter.createCaller(
      createContextFactory(state)({ req: fakeReq, res: fakeRes, info: {} as never }),
    );
    await expect(
      caller.install.testDatabase({
        driver: 'mysql',
        url: 'mysql://u:p@h:3306/d',
        installToken: 'f'.repeat(64),
      }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it('install.testDatabase после installed → FORBIDDEN (даже с правильным токеном)', async () => {
    const token = ensureInstallToken(tokenFilePath);
    const state = fakeState({ installationState: 'installed', installationFilePath });
    const caller = appRouter.createCaller(
      createContextFactory(state)({ req: fakeReq, res: fakeRes, info: {} as never }),
    );
    try {
      await caller.install.testDatabase({
        driver: 'mysql',
        url: 'mysql://u:p@h:3306/d',
        installToken: token,
      });
      throw new Error('должно было упасть');
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe('FORBIDDEN');
    }
  });

  it('install.run после installed → FORBIDDEN', async () => {
    const token = ensureInstallToken(tokenFilePath);
    const state = fakeState({ installationState: 'installed', installationFilePath });
    const caller = appRouter.createCaller(
      createContextFactory(state)({ req: fakeReq, res: fakeRes, info: {} as never }),
    );
    try {
      await caller.install.run({
        driver: 'mysql',
        url: 'mysql://u:p@h:3306/d',
        installToken: token,
        admin: { email: 'a@b.com', password: '12345678' },
      });
      throw new Error('должно было упасть');
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe('FORBIDDEN');
    }
  });

  it('install.run без файла токена → UNAUTHORIZED (атакующий не знает токена)', async () => {
    // Файл токена не создан намеренно
    const state = fakeState({ installationState: 'pristine', installationFilePath });
    const caller = appRouter.createCaller(
      createContextFactory(state)({ req: fakeReq, res: fakeRes, info: {} as never }),
    );
    try {
      await caller.install.run({
        driver: 'mysql',
        url: 'mysql://u:p@h:3306/d',
        installToken: 'a'.repeat(64),
        admin: { email: 'a@b.com', password: '12345678' },
      });
      throw new Error('должно было упасть');
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe('UNAUTHORIZED');
    }
  });
});
