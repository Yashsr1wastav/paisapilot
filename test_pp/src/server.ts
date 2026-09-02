import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createSessionToken, normalizeEmail, passwordHash, requestId, verifyPassword } from './auth.js';
import { GeminiAiGateway, SafeAiGateway } from './ai.js';
import { calculateCashFlow, calculateHealthScore, currentMonth, isValidCalendarDate, isValidMonth, MAX_AMOUNT_PAISE, transactionsForMonth } from './domain.js';
import { parseTransactionCsv } from './import.js';
import { MockDelayedMarketProvider } from './market.js';
import { MemoryStore, PostgreSQLStore } from './store.js';
import type { Account, Budget, Goal, Loan, Transaction } from '@paisapilot/contracts';

function createConfiguredStore(): MemoryStore | PostgreSQLStore {
  const mode = process.env.STORE_MODE ?? (process.env.NODE_ENV === 'production' ? 'postgres' : 'memory');
  if (process.env.NODE_ENV === 'production' && mode !== 'postgres') throw new Error('Production requires STORE_MODE=postgres; MemoryStore is not supported');
  if (mode === 'postgres') {
    if (!process.env.DATABASE_URL) throw new Error('STORE_MODE=postgres requires DATABASE_URL');
    return new PostgreSQLStore(process.env.DATABASE_URL);
  }
  if (mode !== 'memory') throw new Error('STORE_MODE must be memory or postgres');
  return new MemoryStore();
}
const store = createConfiguredStore();
const storeReady = store.ready();
const ai = process.env.GEMINI_API_KEY ? new GeminiAiGateway(process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL) : new SafeAiGateway();
const markets = new MockDelayedMarketProvider();
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
const sessionTtl = Number(process.env.SESSION_TTL_HOURS ?? 24);
const requestCounts = new Map<string, { count: number; resetAt: number }>();
const maxBodyBytes = 2_100_000;
const allowedOrigins = new Set((process.env.CORS_ORIGINS ?? process.env.CORS_ORIGIN ?? 'https://paisapilot.app,http://localhost:3001,http://localhost:8080').split(',').map((o) => o.trim()).filter(Boolean));

function json(response: ServerResponse, status: number, payload: unknown): void { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY' }); response.end(JSON.stringify(payload)); }
function error(response: ServerResponse, status: number, message: string, id: string): void { json(response, status, { error: { message, requestId: id } }); }
async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers['content-length'] ?? 0); if (declaredLength > maxBodyBytes) throw new Error('413: Request body too large');
  let raw = ''; for await (const chunk of request) { raw += chunk.toString(); if (Buffer.byteLength(raw) > maxBodyBytes) throw new Error('413: Request body too large'); }
  if (!raw) return {}; const parsed: unknown = JSON.parse(raw); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON object required'); return parsed as Record<string, unknown>;
}
function amount(value: unknown): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > MAX_AMOUNT_PAISE) throw new Error('amountPaise must be a positive integer within supported bounds'); return value; }
function text(value: unknown, field: string, max = 200): string { if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${field} is invalid`); return value.trim(); }
function date(value: unknown, field: string): string { const result = text(value, field, 10); if (!isValidCalendarDate(result)) throw new Error(`${field} is invalid`); return result; }
function balance(value: unknown): number { if (value === undefined) return 0; if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < -MAX_AMOUNT_PAISE || value > MAX_AMOUNT_PAISE) throw new Error('balancePaise is outside supported bounds'); return value; }
function importFingerprint(userId: string, accountId: string, item: { occurredOn: string; description: string; amountPaise: number; kind: string; category?: string }): string { return createHash('sha256').update(JSON.stringify([userId, accountId, item.occurredOn, item.description, item.amountPaise, item.kind, item.category ?? ''])).digest('hex'); }
function cookieValue(header: string | undefined, name: string): string | undefined { return header?.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${name}=`))?.slice(name.length + 1); }
async function authUser(request: IncomingMessage, response: ServerResponse): Promise<string | undefined> { const cookie = cookieValue(request.headers.cookie, 'paisapilot_session'); const bearer = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : undefined; const userId = (bearer ? await store.authenticateSession(bearer) : undefined) ?? (cookie ? await store.authenticateSession(cookie) : undefined); if (!userId) error(response, 401, 'Authentication required', requestId()); return userId; }
function sessionCookie(token: string, maxAge: number): string { return `paisapilot_session=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=${process.env.NODE_ENV === 'production' ? 'None' : 'Lax'}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`; }
function rateLimited(request: IncomingMessage): boolean { const key = request.socket.remoteAddress ?? 'unknown'; const now = Date.now(); const current = requestCounts.get(key); if (!current || current.resetAt <= now) { requestCounts.set(key, { count: 1, resetAt: now + 60_000 }); return false; } current.count += 1; return current.count > 120; }
function period(url: URL): { month?: string; timeZone: string; selectedMonth: string } {
  const requestedMonth = url.searchParams.get('month') ?? undefined;
  if (requestedMonth !== undefined && !isValidMonth(requestedMonth)) throw new Error('month must use YYYY-MM format');
  const timeZone = url.searchParams.get('timezone') ?? 'UTC';
  currentMonth(timeZone);
  const selectedMonth = requestedMonth ?? currentMonth(timeZone);
  return { month: requestedMonth, timeZone, selectedMonth };
}
function enforceCsrf(request: IncomingMessage, response: ServerResponse, id: string): boolean {
  const method = request.method ?? 'GET';
  const hasCookie = cookieValue(request.headers.cookie, 'paisapilot_session') !== undefined;
  const hasBearer = request.headers.authorization?.startsWith('Bearer ');
  // CSRF only applies to cookie-authenticated requests without a bearer token
  if (!hasCookie || hasBearer || ['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;
  const origin = request.headers.origin;
  if (!origin || !allowedOrigins.has(origin)) { error(response, 403, 'CSRF validation failed', id); return false; }
  return true;
}

async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  await storeReady;
  const id = requestId();
  if (rateLimited(request)) return error(response, 429, 'Too many requests', id);
  const url = new URL(request.url ?? '/', `http://${host}`); const method = request.method ?? 'GET';
  const origin = request.headers.origin; const corsOrigin = origin && allowedOrigins.has(origin) ? origin : undefined;
  response.setHeader('vary', 'Origin');
  if (corsOrigin) { response.setHeader('access-control-allow-origin', corsOrigin); response.setHeader('access-control-allow-credentials', 'true'); response.setHeader('access-control-expose-headers', 'X-Period'); }
  if (method === 'OPTIONS') { response.writeHead(corsOrigin ? 204 : 403, corsOrigin ? { 'access-control-allow-origin': corsOrigin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type, authorization, x-csrf-token, x-paisapilot-client', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', vary: 'Origin' } : {}); return response.end(); }
  if (url.pathname === '/health' && method === 'GET') return json(response, 200, { status: 'ok', service: 'paisapilot-api' });
  try {
    const input = (method === 'GET' || method === 'DELETE') ? {} : await body(request);

    if (url.pathname === '/v1/auth/register' && method === 'POST') {
      const email = normalizeEmail(input.email); if (await store.findUserByEmail(email)) return error(response, 409, 'Email already registered', id);
      const user = { id: store.createId(), email, passwordHash: passwordHash(input.password), createdAt: new Date().toISOString() };
      const token = createSessionToken();
      await store.withTransaction(async () => { await store.insertUser(user); await store.putSettings({ userId: user.id, currency: 'INR', aiEnabled: true, marketingEmails: false }); await store.createSession(token, user.id, Date.now() + sessionTtl * 3600000); });
      response.setHeader('set-cookie', sessionCookie(token, sessionTtl * 3600));
      return json(response, 201, request.headers['x-paisapilot-client'] === 'web' ? { user: { id: user.id, email: user.email } } : { user: { id: user.id, email: user.email }, token });
    }

    if (url.pathname === '/v1/auth/login' && method === 'POST') {
      const email = normalizeEmail(input.email); const user = await store.findUserByEmail(email);
      if (!user || !(await verifyPassword(input.password, user.passwordHash))) return error(response, 401, 'Invalid credentials', id);
      const token = createSessionToken();
      await store.createSession(token, user.id, Date.now() + sessionTtl * 3600000);
      response.setHeader('set-cookie', sessionCookie(token, sessionTtl * 3600));
      return json(response, 200, request.headers['x-paisapilot-client'] === 'web' ? { user: { id: user.id, email: user.email } } : { user: { id: user.id, email: user.email }, token });
    }

    if (url.pathname === '/v1/auth/session' && method === 'GET') {
      const cookie = cookieValue(request.headers.cookie, 'paisapilot_session');
      const bearer = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : undefined;
      const userId = (cookie ? await store.authenticateSession(cookie) : undefined) ?? (bearer ? await store.authenticateSession(bearer) : undefined);
      const user = userId ? await store.findUserById(userId) : undefined;
      if (!user) return error(response, 401, 'Authentication required', id);
      return json(response, 200, { user: { id: user.id, email: user.email } });
    }

    if (url.pathname === '/v1/markets/quote' && method === 'GET') return json(response, 200, await markets.quote(url.searchParams.get('symbol') ?? ''));

    const userId = await authUser(request, response); if (!userId) return;
    if (!enforceCsrf(request, response, id)) return;

    if (url.pathname === '/v1/auth/session' && method === 'DELETE') {
      const token = request.headers.authorization?.slice(7);
      if (token) await store.revokeSession(token);
      const cookie = cookieValue(request.headers.cookie, 'paisapilot_session'); if (cookie && cookie !== token) await store.revokeSession(cookie);
      response.setHeader('set-cookie', sessionCookie('', 0));
      return json(response, 200, { revoked: true });
    }

    if (url.pathname === '/v1/accounts' && method === 'GET') return json(response, 200, { accounts: await store.listAccounts(userId) });
    if (url.pathname === '/v1/accounts' && method === 'POST') { const account: Account = { id: store.createId(), userId, name: text(input.name, 'name'), type: text(input.type, 'type') as Account['type'], balancePaise: balance(input.balancePaise), currency: 'INR', createdAt: new Date().toISOString() }; if (!['bank', 'cash', 'credit_card', 'upi_wallet', 'fd', 'loan', 'custom'].includes(account.type)) throw new Error('Invalid account type'); await store.putAccount(account); return json(response, 201, account); }
    if (url.pathname === '/v1/transactions' && method === 'GET') return json(response, 200, { transactions: await store.listTransactions(userId) });
    if (url.pathname === '/v1/transactions' && method === 'POST') { const accountId = text(input.accountId, 'accountId'); const kind = text(input.kind, 'kind') as Transaction['kind']; if (!['income', 'expense'].includes(kind)) throw new Error('Use /transfer for transfers'); const amountPaise = amount(input.amountPaise); const transaction: Transaction = { id: store.createId(), userId, accountId, amountPaise, kind, description: text(input.description, 'description', 500), occurredOn: date(input.occurredOn, 'occurredOn'), createdAt: new Date().toISOString() }; if (typeof input.category === 'string') transaction.category = input.category.slice(0, 100); await store.withTransaction(async () => { await store.adjustAccountBalance(accountId, userId, kind === 'income' ? amountPaise : -amountPaise); await store.putTransaction(transaction); }); return json(response, 201, transaction); }
    if (url.pathname === '/v1/transfers' && method === 'POST') { const fromAccountId = text(input.fromAccountId, 'fromAccountId'); const toAccountId = text(input.toAccountId, 'toAccountId'); if (fromAccountId === toAccountId) throw new Error('Transfer accounts must differ'); const value = amount(input.amountPaise); const common = { userId, amountPaise: value, description: text(input.description, 'description', 500), occurredOn: date(input.occurredOn, 'occurredOn'), kind: 'transfer' as const, createdAt: new Date().toISOString() }; const outgoing: Transaction = { id: store.createId(), accountId: fromAccountId, transferAccountId: toAccountId, ...common }; const incoming: Transaction = { id: store.createId(), accountId: toAccountId, transferAccountId: fromAccountId, ...common }; await store.withTransaction(async () => { await store.adjustAccountBalance(fromAccountId, userId, -value); await store.adjustAccountBalance(toAccountId, userId, value); await store.putTransaction(outgoing); await store.putTransaction(incoming); }); return json(response, 201, { transactions: [outgoing, incoming] }); }
    if (url.pathname === '/v1/import/transactions' && method === 'POST') { const accountId = text(input.accountId, 'accountId'); const csv = text(input.csv, 'csv', 2_000_000); const transactions = await store.withTransaction(async () => { const account = await store.getAccount(accountId, userId); if (!account) throw new Error('Resource not found'); const imported = parseTransactionCsv(csv); const output: Transaction[] = []; for (const item of imported) { const fingerprint = importFingerprint(userId, accountId, item); const importId = store.createId(); if (!(await store.putImport({ id: importId, userId, accountId, fingerprint, transactionId: null }))) continue; const transaction: Transaction = { id: store.createId(), userId, accountId, ...item, createdAt: new Date().toISOString() }; await store.adjustAccountBalance(accountId, userId, item.kind === 'income' ? item.amountPaise : -item.amountPaise); await store.putTransaction(transaction); await store.linkImportTransaction(importId, transaction.id); output.push(transaction); } return output; }); return json(response, 201, { imported: transactions.length, transactions }); }
    if (url.pathname === '/v1/health-score' && method === 'GET') { const selected = period(url); response.setHeader('x-period', selected.selectedMonth); return json(response, 200, calculateHealthScore(await store.listAccounts(userId), transactionsForMonth(await store.listTransactions(userId), selected.month, selected.timeZone))); }
    if (url.pathname === '/v1/summary' && method === 'GET') { const selected = period(url); response.setHeader('x-period', selected.selectedMonth); return json(response, 200, calculateCashFlow(transactionsForMonth(await store.listTransactions(userId), selected.month, selected.timeZone))); }
    if (url.pathname === '/v1/goals' && method === 'GET') return json(response, 200, { goals: await store.listGoals(userId) });
    if (url.pathname === '/v1/goals' && method === 'POST') { const goal: Goal = { id: store.createId(), userId, name: text(input.name, 'name'), targetPaise: amount(input.targetPaise), currentPaise: 0, targetDate: date(input.targetDate, 'targetDate') }; await store.putGoal(goal); return json(response, 201, goal); }
    if (url.pathname === '/v1/budgets' && method === 'GET') return json(response, 200, { budgets: await store.listBudgets(userId) });
    if (url.pathname === '/v1/budgets' && method === 'POST') { const month = text(input.month, 'month', 7); if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('month is invalid'); const budget: Budget = { id: store.createId(), userId, category: text(input.category, 'category'), limitPaise: amount(input.limitPaise), month }; await store.putBudget(budget); return json(response, 201, budget); }
    if (url.pathname === '/v1/loans' && method === 'GET') return json(response, 200, { loans: await store.listLoans(userId) });
    if (url.pathname === '/v1/loans' && method === 'POST') { if (typeof input.annualRatePercent !== 'number' || !Number.isFinite(input.annualRatePercent) || input.annualRatePercent < 0 || input.annualRatePercent > 100) throw new Error('annualRatePercent is invalid'); const loan: Loan = { id: store.createId(), userId, name: text(input.name, 'name'), principalPaise: amount(input.principalPaise), annualRatePercent: input.annualRatePercent, monthlyPaymentPaise: amount(input.monthlyPaymentPaise) }; await store.putLoan(loan); return json(response, 201, loan); }
    if (url.pathname === '/v1/ai/answer' && method === 'POST') { if (!(await store.getSettings(userId)).aiEnabled) return error(response, 403, 'AI features are disabled', id); const prompt = text(input.prompt, 'prompt', 2000); const transactions = await store.listTransactions(userId); const accounts = await store.listAccounts(userId); return json(response, 200, await ai.answer(prompt, { cashFlow: calculateCashFlow(transactions), accountCount: accounts.length })); }
    if (url.pathname === '/v1/settings' && method === 'GET') return json(response, 200, await store.getSettings(userId));
    if (url.pathname === '/v1/settings' && method === 'PUT') { const current = await store.getSettings(userId); const settings = { ...current, aiEnabled: typeof input.aiEnabled === 'boolean' ? input.aiEnabled : current.aiEnabled, marketingEmails: typeof input.marketingEmails === 'boolean' ? input.marketingEmails : current.marketingEmails }; await store.putSettings(settings); return json(response, 200, settings); }
    if (url.pathname === '/v1/privacy/export' && method === 'GET') return json(response, 200, await store.exportUser(userId));
    if (url.pathname === '/v1/privacy/delete' && method === 'DELETE') { await store.deleteUserDurable(userId); return json(response, 200, { deleted: true }); }
    return error(response, 404, 'Not found', id);
  } catch (caught) { const message = caught instanceof SyntaxError ? 'Invalid JSON' : caught instanceof Error ? caught.message : 'Request failed'; return error(response, message.startsWith('413:') ? 413 : 400, message.replace(/^413:\s*/, ''), id); }
}

export const apiStore = store;
export const server = createServer((request, response) => { void handler(request, response); });
if (process.env.NODE_ENV !== 'test') void storeReady.then(() => server.listen(port, host, () => console.log(`PaisaPilot API listening on http://${host}:${port}`))).catch((error: unknown) => { console.error('Persistence initialization failed', error); process.exitCode = 1; });
