import { describe, expect, it } from 'vitest';
import { generateSessionId, signValue, unsignValue } from './session';

const SECRET = 'a'.repeat(64);

describe('session helpers', () => {
  it('generates 64-hex-char identifiers', () => {
    const id = generateSessionId();
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('signs and unsigns a round-trip value', () => {
    const signed = signValue('hello-world', SECRET);
    expect(signed.startsWith('hello-world.')).toBe(true);
    expect(unsignValue(signed, SECRET)).toBe('hello-world');
  });

  it('rejects tampered signatures', () => {
    const signed = signValue('payload', SECRET);
    const tampered = `${signed}x`;
    expect(unsignValue(tampered, SECRET)).toBeNull();
  });

  it('rejects values signed with the wrong secret', () => {
    const signed = signValue('payload', SECRET);
    expect(unsignValue(signed, 'b'.repeat(64))).toBeNull();
  });

  it('rejects values without a separator', () => {
    expect(unsignValue('no-dot-here', SECRET)).toBeNull();
  });
});
