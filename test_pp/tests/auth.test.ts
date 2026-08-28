import { describe, expect, it } from 'vitest';
import { authenticate, createSession, normalizeEmail, passwordHash, verifyPassword } from '../src/auth.js';
import { MemoryStore } from '../src/store.js';

describe('authentication boundaries', () => {
  it('normalizes valid email and rejects invalid or oversized values', () => {
    expect(normalizeEmail('  USER@Example.com ')).toBe('user@example.com');
    expect(() => normalizeEmail('not-an-email')).toThrow('Invalid email');
    expect(() => normalizeEmail(`${'a'.repeat(249)}@x.com`)).toThrow('Invalid email');
  });

  it('enforces password length and verifies only the original password', async () => {
    expect(() => passwordHash('short')).toThrow('12-200');
    await expect(verifyPassword('short', 'salt:00'.repeat(32))).resolves.toBe(false);
    await expect(verifyPassword('x'.repeat(201), 'salt:00'.repeat(32))).resolves.toBe(false);
    const encoded = passwordHash('correct horse battery staple');
    await expect(verifyPassword('correct horse battery staple', encoded)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', encoded)).resolves.toBe(false);
    await expect(verifyPassword('anything', 'salt:abc')).resolves.toBe(false);
  });

  it('rejects absent, malformed, expired, and unknown sessions', () => {
    const store = new MemoryStore();
    expect(authenticate(store, undefined)).toBeUndefined();
    expect(authenticate(store, 'Basic token')).toBeUndefined();
    expect(authenticate(store, 'Bearer unknown')).toBeUndefined();
    const expired = createSession(store, 'u1', -1);
    expect(authenticate(store, `Bearer ${expired}`)).toBeUndefined();
    expect(store.sessions.has(expired)).toBe(false);
  });
});