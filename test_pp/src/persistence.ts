import { createCipheriv, randomBytes } from 'node:crypto';

/** Persistence boundary: MemoryStore is a development/test adapter only and loses all data on restart. */
export interface DurableStore {
  get<T>(userId: string, collection: string, id: string): Promise<T | undefined>;
  put<T>(userId: string, collection: string, id: string, value: T): Promise<void>;
  deleteUser(userId: string): Promise<void>;
}

export interface EncryptedRecordEnvelope { version: 1; algorithm: 'aes-256-gcm'; keyId: string; iv: string; tag: string; ciphertext: string; }

export function encryptRecord(plaintext: string, key: Buffer, keyId: string): EncryptedRecordEnvelope {
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes');
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { version: 1, algorithm: 'aes-256-gcm', keyId, iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), ciphertext: ciphertext.toString('base64url') };
}

export const durableSchemaMigrationPlan = Object.freeze([
  'Run migrations/001_initial.sql to create users, sessions, accounts, transactions, imports, goals, budgets, loans, and settings tables with user_id foreign keys.',
  'Use UUID identifiers for imports, the imports table unique constraint for idempotent import fingerprints, and transaction indexes on (user_id, occurred_on).',
  'Encrypt sensitive record payloads with a KMS-managed AES-256-GCM key and retain key_id for rotation.',
  'Migrate MemoryStore exports in batches, verify counts/checksums, then switch reads and writes behind PostgreSQLStore.'
]);