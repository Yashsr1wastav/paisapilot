import { createHash, randomBytes, randomUUID, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { MemoryStore } from './store.js';

export interface UserRecord { id: string; email: string; passwordHash: string; createdAt: string; }
const scryptAsync = promisify(scrypt);

export function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Email is required');
  const email = value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) throw new Error('Invalid email');
  return email;
}
export function passwordHash(password: unknown): string {
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) throw new Error('Password must be 12-200 characters');
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}
export async function verifyPassword(password: unknown, encoded: string): Promise<boolean> {
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) return false;
  const [salt, expected] = encoded.split(':');
  if (!salt || !expected) return false;
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (expectedBuffer.length !== 32) return false;
  const actual = Buffer.from(await scryptAsync(password, salt, 32));
  return timingSafeEqual(actual, expectedBuffer);
}
export function createSession(store: MemoryStore, userId: string, ttlHours: number): string {
  const token = createSessionToken();
  store.sessions.set(token, { userId, expiresAt: Date.now() + ttlHours * 3600000 });
  return token;
}
export function createSessionToken(): string { return randomBytes(32).toString('base64url'); }
export function authenticate(store: MemoryStore, header: string | undefined): string | undefined {
  if (!header?.startsWith('Bearer ')) return undefined;
  const token = header.slice(7);
  const session = store.sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) { if (session) store.sessions.delete(token); return undefined; }
  return session.userId;
}
export function requestId(): string { return randomUUID(); }
export function hashValue(value: string): string { return createHash('sha256').update(value).digest('hex'); }
