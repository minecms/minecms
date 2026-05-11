import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('argon2 password helpers', () => {
  it('refuses passwords shorter than 8 characters', async () => {
    await expect(hashPassword('abc')).rejects.toThrow(/8/);
  });

  it('hashes a password and verifies the same value', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects a wrong password without throwing', async () => {
    const hash = await hashPassword('right-password-123');
    expect(await verifyPassword('wrong-password-123', hash)).toBe(false);
  });

  it('returns false for malformed hash strings instead of throwing', async () => {
    expect(await verifyPassword('whatever', 'not-an-argon2-string')).toBe(false);
  });
});
