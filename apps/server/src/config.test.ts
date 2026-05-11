import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const baseEnv = {
  SESSION_SECRET: 'a'.repeat(64),
  NODE_ENV: 'test',
} as NodeJS.ProcessEnv;

describe('loadConfig', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'minecms-config-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('parses minimum env into defaults', () => {
    const config = loadConfig({ env: baseEnv, cwd });
    expect(config.env.PORT).toBe(3333);
    expect(config.env.HOST).toBe('127.0.0.1');
    expect(config.env.LOG_LEVEL).toBe('info');
    expect(config.database).toBeNull();
    expect(config.installationState).toBe('pristine');
  });

  it('rejects short SESSION_SECRET', () => {
    expect(() => loadConfig({ env: { SESSION_SECRET: 'too_short' }, cwd })).toThrowError(
      /SESSION_SECRET/,
    );
  });

  it('treats env DATABASE_DRIVER+URL as a connection', () => {
    const config = loadConfig({
      env: {
        ...baseEnv,
        DATABASE_DRIVER: 'mysql',
        DATABASE_URL: 'mysql://u:p@host:3306/db',
      },
      cwd,
    });
    expect(config.database).toEqual({ driver: 'mysql', url: 'mysql://u:p@host:3306/db' });
  });

  it('prefers data/installation.json over .env when present', () => {
    mkdirSync(join(cwd, 'data'), { recursive: true });
    writeFileSync(
      join(cwd, 'data', 'installation.json'),
      JSON.stringify({
        driver: 'postgres',
        url: 'postgres://u:p@host:5432/db',
        state: 'installed',
      }),
    );

    const config = loadConfig({
      env: {
        ...baseEnv,
        DATABASE_DRIVER: 'mysql',
        DATABASE_URL: 'mysql://overridden',
      },
      cwd,
    });
    expect(config.database).toEqual({ driver: 'postgres', url: 'postgres://u:p@host:5432/db' });
    expect(config.installationState).toBe('installed');
  });

  it('ignores corrupted installation.json silently', () => {
    mkdirSync(join(cwd, 'data'), { recursive: true });
    writeFileSync(join(cwd, 'data', 'installation.json'), '{not valid json');
    const config = loadConfig({ env: baseEnv, cwd });
    expect(config.installationState).toBe('pristine');
    expect(config.database).toBeNull();
  });
});
