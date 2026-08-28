import { randomUUID } from 'node:crypto';
import type { Account, Budget, ExportBundle, Goal, Loan, Transaction, UserSettings } from '@paisapilot/contracts';
import type { UserRecord } from './auth.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, type PoolClient } from 'pg';
import { MAX_AMOUNT_PAISE } from './domain.js';

export class MemoryStore {
  readonly users = new Map<string, UserRecord>();
  readonly sessions = new Map<string, { userId: string; expiresAt: number }>();
  readonly accounts = new Map<string, Account>();
  readonly transactions = new Map<string, Transaction>();
  readonly goals = new Map<string, Goal>();
  readonly budgets = new Map<string, Budget>();
  readonly loans = new Map<string, Loan>();
  readonly settings = new Map<string, UserSettings>();
  readonly imports = new Map<string, { id: string; userId: string; accountId: string; fingerprint: string; transactionId: string | null }>();
  /** Undo journal for the in-flight withTransaction call (if any), so a mid-sequence failure rolls back cleanly instead of leaving partial writes. */
  private readonly journal = new AsyncLocalStorage<Array<() => void>>();
  private record(undo: () => void): void { this.journal.getStore()?.push(undo); }

  add<T extends { id: string }>(collection: Map<string, T>, item: T): T { collection.set(item.id, item); return item; }
  userAccounts(userId: string): Account[] { return [...this.accounts.values()].filter((item) => item.userId === userId); }
  userTransactions(userId: string): Transaction[] { return [...this.transactions.values()].filter((item) => item.userId === userId); }
  userGoals(userId: string): Goal[] { return [...this.goals.values()].filter((item) => item.userId === userId); }
  userBudgets(userId: string): Budget[] { return [...this.budgets.values()].filter((item) => item.userId === userId); }
  userLoans(userId: string): Loan[] { return [...this.loans.values()].filter((item) => item.userId === userId); }
  createId(): string { return randomUUID(); }

  async exportUser(userId: string): Promise<ExportBundle> {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');
    return {
      exportedAt: new Date().toISOString(),
      user: { id: user.id, email: user.email },
      accounts: this.userAccounts(userId), transactions: this.userTransactions(userId),
      goals: this.userGoals(userId), budgets: this.userBudgets(userId), loans: this.userLoans(userId),
      settings: this.settings.get(userId) ?? { userId, currency: 'INR', aiEnabled: true, marketingEmails: false }
    };
  }

  deleteUser(userId: string): void {
    this.users.delete(userId); this.settings.delete(userId);
    for (const [id, item] of this.accounts) if (item.userId === userId) this.accounts.delete(id);
    for (const [id, item] of this.transactions) if (item.userId === userId) this.transactions.delete(id);
    for (const [id, item] of this.goals) if (item.userId === userId) this.goals.delete(id);
    for (const [id, item] of this.budgets) if (item.userId === userId) this.budgets.delete(id);
    for (const [id, item] of this.loans) if (item.userId === userId) this.loans.delete(id);
    for (const [id, item] of this.imports) if (item.userId === userId) this.imports.delete(id);
    for (const [token, session] of this.sessions) if (session.userId === userId) this.sessions.delete(token);
  }

  async ready(): Promise<void> {}
  async persist(): Promise<void> {}
  async revokeSession(token: string): Promise<void> { this.sessions.delete(token); }
  async deleteUserDurable(userId: string): Promise<void> { this.deleteUser(userId); }
  /** Runs operation() under an undo journal; if it throws, every recorded write is rolled back in reverse order before rethrowing. Mirrors PostgreSQLStore's real BEGIN/COMMIT/ROLLBACK so multi-step mutations (transfers, imports) can't leave partial state on failure. */
  async withTransaction<T>(operation: () => Promise<T>): Promise<T> {
    const undo: Array<() => void> = [];
    try {
      return await this.journal.run(undo, operation);
    } catch (caught) {
      for (let index = undo.length - 1; index >= 0; index -= 1) undo[index]!();
      throw caught;
    }
  }

  async findUserByEmail(email: string): Promise<UserRecord | undefined> { return [...this.users.values()].find((user) => user.email === email); }
  async findUserById(id: string): Promise<UserRecord | undefined> { return this.users.get(id); }
  async insertUser(user: UserRecord): Promise<void> { this.users.set(user.id, user); this.record(() => this.users.delete(user.id)); }
  async getSettings(userId: string): Promise<UserSettings> { return this.settings.get(userId) ?? { userId, currency: 'INR', aiEnabled: true, marketingEmails: false }; }
  async putSettings(settings: UserSettings): Promise<void> { const previous = this.settings.get(settings.userId); this.settings.set(settings.userId, settings); this.record(() => { if (previous) this.settings.set(settings.userId, previous); else this.settings.delete(settings.userId); }); }
  async listAccounts(userId: string): Promise<Account[]> { return this.userAccounts(userId); }
  async getAccount(id: string, userId: string): Promise<Account | undefined> { const item = this.accounts.get(id); return item?.userId === userId ? item : undefined; }
  async putAccount(account: Account): Promise<void> { const previous = this.accounts.get(account.id); this.accounts.set(account.id, account); this.record(() => { if (previous) this.accounts.set(account.id, previous); else this.accounts.delete(account.id); }); }
  /** Atomically applies a balance delta (income/expense/transfer leg) to one account, replacing the old read-account -> compute -> putAccount pattern. That pattern re-derived the new balance from a value read earlier in the request, so two concurrent writes to the same account could both read the same starting balance and the second write would silently clobber the first (a classic lost-update race). Folding read+compute+write into one call with no intervening `await` (and, for PostgreSQLStore, one atomic UPDATE under a row lock) closes that gap. */
  async adjustAccountBalance(id: string, userId: string, deltaPaise: number): Promise<Account> {
    const account = this.accounts.get(id);
    if (!account || account.userId !== userId) throw new Error('Resource not found');
    const nextBalance = account.balancePaise + deltaPaise;
    if (!Number.isSafeInteger(nextBalance) || nextBalance < -MAX_AMOUNT_PAISE || nextBalance > MAX_AMOUNT_PAISE) throw new Error('Resulting balance is outside supported bounds');
    const updated: Account = { ...account, balancePaise: nextBalance };
    this.accounts.set(id, updated);
    this.record(() => this.accounts.set(id, account));
    return updated;
  }
  async listTransactions(userId: string): Promise<Transaction[]> { return this.userTransactions(userId); }
  async putTransaction(transaction: Transaction): Promise<void> { const previous = this.transactions.get(transaction.id); this.transactions.set(transaction.id, transaction); this.record(() => { if (previous) this.transactions.set(transaction.id, previous); else this.transactions.delete(transaction.id); }); }
  async listGoals(userId: string): Promise<Goal[]> { return this.userGoals(userId); }
  async putGoal(goal: Goal): Promise<void> { const previous = this.goals.get(goal.id); this.goals.set(goal.id, goal); this.record(() => { if (previous) this.goals.set(goal.id, previous); else this.goals.delete(goal.id); }); }
  async listBudgets(userId: string): Promise<Budget[]> { return this.userBudgets(userId); }
  async putBudget(budget: Budget): Promise<void> { const previous = this.budgets.get(budget.id); this.budgets.set(budget.id, budget); this.record(() => { if (previous) this.budgets.set(budget.id, previous); else this.budgets.delete(budget.id); }); }
  async listLoans(userId: string): Promise<Loan[]> { return this.userLoans(userId); }
  async putLoan(loan: Loan): Promise<void> { const previous = this.loans.get(loan.id); this.loans.set(loan.id, loan); this.record(() => { if (previous) this.loans.set(loan.id, previous); else this.loans.delete(loan.id); }); }
  async hasImport(userId: string, accountId: string, fingerprint: string): Promise<boolean> { return [...this.imports.values()].some((item) => item.userId === userId && item.accountId === accountId && item.fingerprint === fingerprint); }
  async putImport(item: { id: string; userId: string; accountId: string; fingerprint: string; transactionId: string | null }): Promise<boolean> { const key = `${item.userId}:${item.accountId}:${item.fingerprint}`; if (this.imports.has(key)) return false; this.imports.set(key, item); this.record(() => this.imports.delete(key)); return true; }
  /** Completes an import row after the referenced transaction has actually been written (see comment on putImport's caller in server.ts for why this is a separate step: transaction_id has a foreign key to transactions(id), so it can't be set until that row exists). */
  async linkImportTransaction(id: string, transactionId: string): Promise<void> { for (const [key, value] of this.imports) { if (value.id === id) { const previous = value; this.imports.set(key, { ...value, transactionId }); this.record(() => this.imports.set(key, previous)); return; } } }
  async createSession(token: string, userId: string, expiresAt: number): Promise<void> { this.sessions.set(token, { userId, expiresAt }); this.record(() => this.sessions.delete(token)); }
  async authenticateSession(token: string): Promise<string | undefined> { const session = this.sessions.get(token); if (!session || session.expiresAt <= Date.now()) { if (session) this.sessions.delete(token); return undefined; } return session.userId; }
}

type CollectionName = 'accounts' | 'transactions' | 'goals' | 'budgets' | 'loans';
const collections: CollectionName[] = ['accounts', 'transactions', 'goals', 'budgets', 'loans'];

/** PostgreSQL adapter. Maps are inherited only for MemoryStore compatibility; production I/O is row-level. */
export class PostgreSQLStore extends MemoryStore {
  private readonly pool: Pool;
  private readonly transaction = new AsyncLocalStorage<PoolClient>();

  constructor(databaseUrl: string) {
    super();
    this.pool = new Pool({ connectionString: databaseUrl, max: Number(process.env.DB_POOL_MAX ?? 10), idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined });
  }

  override async ready(): Promise<void> {
    await this.pool.query('SELECT 1');
  }
  private async query<T>(text: string, values: unknown[] = []): Promise<{ rows: T[] }> { const client = this.transaction.getStore(); return client ? client.query<T>(text, values) : this.pool.query<T>(text, values); }
  private async row<T extends { data: unknown }>(table: CollectionName, id: string, userId: string): Promise<T['data'] | undefined> { const result = await this.query<T>(`SELECT data FROM ${table} WHERE id = $1 AND user_id = $2`, [id, userId]); return result.rows[0]?.data; }
  private async list<T extends { data: unknown }>(table: CollectionName, userId: string): Promise<T['data'][]> { const result = await this.query<T>(`SELECT data FROM ${table} WHERE user_id = $1 ORDER BY id`, [userId]); return result.rows.map((item) => item.data); }
  private async put<T extends { id: string; userId: string }>(table: CollectionName, item: T): Promise<void> { await this.query(`INSERT INTO ${table} (id, user_id, data) VALUES ($1,$2,$3::jsonb) ON CONFLICT (id) DO UPDATE SET user_id=EXCLUDED.user_id, data=EXCLUDED.data`, [item.id, item.userId, JSON.stringify(item)]); }
  override async findUserByEmail(email: string): Promise<UserRecord | undefined> { const result = await this.query<UserRecord>('SELECT id, email, password_hash AS "passwordHash", created_at AS "createdAt" FROM users WHERE email = $1', [email]); return result.rows[0]; }
  override async findUserById(id: string): Promise<UserRecord | undefined> { const result = await this.query<UserRecord>('SELECT id, email, password_hash AS "passwordHash", created_at AS "createdAt" FROM users WHERE id = $1', [id]); return result.rows[0]; }
  override async insertUser(user: UserRecord): Promise<void> { await this.query('INSERT INTO users (id,email,password_hash,created_at) VALUES ($1,$2,$3,$4)', [user.id, user.email, user.passwordHash, user.createdAt]); }
  override async getSettings(userId: string): Promise<UserSettings> { const result = await this.query<{ data: UserSettings }>('SELECT data FROM settings WHERE user_id = $1', [userId]); return result.rows[0]?.data ?? { userId, currency: 'INR', aiEnabled: true, marketingEmails: false }; }
  override async putSettings(settings: UserSettings): Promise<void> { await this.query('INSERT INTO settings (user_id,data) VALUES ($1,$2::jsonb) ON CONFLICT (user_id) DO UPDATE SET data=EXCLUDED.data', [settings.userId, JSON.stringify(settings)]); }
  override async listAccounts(userId: string): Promise<Account[]> { return this.list<{ data: Account }>('accounts', userId); }
  override async getAccount(id: string, userId: string): Promise<Account | undefined> { return this.row<{ data: Account }>('accounts', id, userId); }
  override async putAccount(account: Account): Promise<void> { await this.put('accounts', account); }
  /** Single atomic UPDATE (delta applied in SQL, not read-then-recompute-then-write in application code). Postgres takes a row lock for the duration of this statement, so a concurrent adjustAccountBalance on the same account blocks until this one commits/rolls back and then applies its own delta on top of the now-current value — no lost updates, no separate SELECT...FOR UPDATE needed. Must be called inside store.withTransaction() alongside the related transaction-row insert so both commit or roll back together. */
  override async adjustAccountBalance(id: string, userId: string, deltaPaise: number): Promise<Account> {
    const result = await this.query<{ data: Account }>(
      `UPDATE accounts SET data = jsonb_set(data, '{balancePaise}', to_jsonb(((data->>'balancePaise')::bigint + $1::bigint))) WHERE id = $2 AND user_id = $3 RETURNING data`,
      [deltaPaise, id, userId]
    );
    const account = result.rows[0]?.data;
    if (!account) throw new Error('Resource not found');
    if (!Number.isSafeInteger(account.balancePaise) || account.balancePaise < -MAX_AMOUNT_PAISE || account.balancePaise > MAX_AMOUNT_PAISE) throw new Error('Resulting balance is outside supported bounds');
    return account;
  }
  override async listTransactions(userId: string): Promise<Transaction[]> { return this.list<{ data: Transaction }>('transactions', userId); }
  override async putTransaction(transaction: Transaction): Promise<void> { await this.put('transactions', transaction); }
  override async listGoals(userId: string): Promise<Goal[]> { return this.list<{ data: Goal }>('goals', userId); }
  override async putGoal(goal: Goal): Promise<void> { await this.put('goals', goal); }
  override async listBudgets(userId: string): Promise<Budget[]> { return this.list<{ data: Budget }>('budgets', userId); }
  override async putBudget(budget: Budget): Promise<void> { await this.put('budgets', budget); }
  override async listLoans(userId: string): Promise<Loan[]> { return this.list<{ data: Loan }>('loans', userId); }
  override async putLoan(loan: Loan): Promise<void> { await this.put('loans', loan); }
  override async hasImport(userId: string, accountId: string, fingerprint: string): Promise<boolean> { const result = await this.query('SELECT 1 FROM imports WHERE user_id=$1 AND account_id=$2 AND fingerprint=$3', [userId, accountId, fingerprint]); return result.rows.length > 0; }
  override async putImport(item: { id: string; userId: string; accountId: string; fingerprint: string; transactionId: string | null }): Promise<boolean> { const result = await this.query('INSERT INTO imports (id,user_id,account_id,fingerprint,transaction_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id,account_id,fingerprint) DO NOTHING RETURNING id', [item.id, item.userId, item.accountId, item.fingerprint, item.transactionId]); return result.rows.length > 0; }
  override async linkImportTransaction(id: string, transactionId: string): Promise<void> { await this.query('UPDATE imports SET transaction_id = $1 WHERE id = $2', [transactionId, id]); }
  override async exportUser(userId: string): Promise<ExportBundle> { const userResult = await this.query<UserRecord>('SELECT id, email, password_hash AS "passwordHash", created_at AS "createdAt" FROM users WHERE id = $1', [userId]); const user = userResult.rows[0]; if (!user) throw new Error('User not found'); return { exportedAt: new Date().toISOString(), user: { id: user.id, email: user.email }, accounts: await this.listAccounts(userId), transactions: await this.listTransactions(userId), goals: await this.listGoals(userId), budgets: await this.listBudgets(userId), loans: await this.listLoans(userId), settings: await this.getSettings(userId) }; }
  override async revokeSession(token: string): Promise<void> { await this.query('DELETE FROM sessions WHERE token = $1', [token]); }
  override async createSession(token: string, userId: string, expiresAt: number): Promise<void> { await this.query('INSERT INTO sessions (token,user_id,expires_at) VALUES ($1,$2,to_timestamp($3 / 1000.0))', [token, userId, expiresAt]); }
  override async authenticateSession(token: string): Promise<string | undefined> { const result = await this.query<{ userId: string; expiresAt: string }>('SELECT user_id AS "userId", expires_at AS "expiresAt" FROM sessions WHERE token = $1', [token]); const session = result.rows[0]; if (!session || new Date(session.expiresAt).getTime() <= Date.now()) { if (session) await this.revokeSession(token); return undefined; } return session.userId; }
  override async deleteUserDurable(userId: string): Promise<void> { await this.withTransaction(async () => { await this.query('DELETE FROM users WHERE id = $1', [userId]); }); }
  override async withTransaction<T>(operation: () => Promise<T>): Promise<T> { const client = await this.pool.connect(); try { await client.query('BEGIN'); const result = await this.transaction.run(client, operation); await client.query('COMMIT'); return result; } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); } }
  async close(): Promise<void> { await this.pool.end(); }
}
