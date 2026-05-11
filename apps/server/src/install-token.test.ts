import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  consumeInstallToken,
  ensureInstallToken,
  readInstallToken,
  verifyInstallToken,
} from './install-token';

describe('install-token', () => {
  let tmpDir: string;
  let tokenPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'minecms-token-'));
    tokenPath = join(tmpDir, 'install.token');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('ensureInstallToken создаёт файл с 64-hex токеном и perm 0600', () => {
    const token = ensureInstallToken(tokenPath);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const stat = statSync(tokenPath);
    // Под Unix биты прав: проверяем что owner-only.
    expect(stat.mode & 0o077).toBe(0);
    expect(stat.mode & 0o600).toBe(0o600);
    const stored = readFileSync(tokenPath, 'utf8').trim();
    expect(stored).toBe(token);
  });

  it('ensureInstallToken идемпотентен: при повторном вызове возвращает тот же токен', () => {
    const first = ensureInstallToken(tokenPath);
    const second = ensureInstallToken(tokenPath);
    expect(second).toBe(first);
  });

  it('ensureInstallToken перезаписывает сломанный файл', () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(tokenPath, 'not-a-valid-token', { encoding: 'utf8' });
    const token = ensureInstallToken(tokenPath);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(tokenPath, 'utf8').trim()).toBe(token);
  });

  it('readInstallToken возвращает null, если файла нет', () => {
    expect(readInstallToken(tokenPath)).toBeNull();
  });

  it('readInstallToken игнорирует мусорный файл', () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(tokenPath, 'nope', { encoding: 'utf8' });
    expect(readInstallToken(tokenPath)).toBeNull();
  });

  it('verifyInstallToken отдаёт false на невалидную форму', () => {
    ensureInstallToken(tokenPath);
    expect(verifyInstallToken('', tokenPath)).toBe(false);
    expect(verifyInstallToken(null, tokenPath)).toBe(false);
    expect(verifyInstallToken(123, tokenPath)).toBe(false);
    expect(verifyInstallToken('zz'.repeat(32), tokenPath)).toBe(false);
    expect(verifyInstallToken('a'.repeat(63), tokenPath)).toBe(false);
  });

  it('verifyInstallToken возвращает true только для точного совпадения', () => {
    const token = ensureInstallToken(tokenPath);
    expect(verifyInstallToken(token, tokenPath)).toBe(true);
    const wrong = `${token.slice(0, -1)}0`; // изменён последний символ
    expect(verifyInstallToken(wrong, tokenPath)).toBe(wrong === token);
    expect(verifyInstallToken(token.toUpperCase(), tokenPath)).toBe(false);
  });

  it('verifyInstallToken возвращает false, если файл удалён', () => {
    const token = ensureInstallToken(tokenPath);
    consumeInstallToken(tokenPath);
    expect(verifyInstallToken(token, tokenPath)).toBe(false);
  });

  it('consumeInstallToken идемпотентен', () => {
    ensureInstallToken(tokenPath);
    consumeInstallToken(tokenPath);
    expect(() => consumeInstallToken(tokenPath)).not.toThrow();
  });
});
