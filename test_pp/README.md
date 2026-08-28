# PaisaPilot backend

A correctness-first TypeScript API foundation for the Android-first PaisaPilot app. V1 is free-only, uses INR/paise, and has no broker, bank aggregator, SMS, billing, or live paid market integration.

## Run locally

1. Install Node.js 20+.
2. Run `npm install`.
3. Copy `.env.example` to `.env`. Local development defaults to `STORE_MODE=memory`; set `ANTHROPIC_API_KEY` only when enabling the live AI adapter.
4. Run `npm run dev`.
5. Check `GET http://127.0.0.1:3000/health`.

CI uses `npm ci` and requires a committed `package-lock.json`. Generate it once with `npm install --package-lock-only` and commit the resulting lockfile. The mobile CI job is enabled after generating `mobile/package-lock.json` with `npm install --package-lock-only` from `mobile/`.

The default repository is in-memory for local development and tests. Production refuses to start unless `STORE_MODE=postgres` and `DATABASE_URL` are set. Install dependencies, apply migrations in filename order with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/001_initial.sql`, `migrations/002_import_uuid.sql`, and `migrations/003_row_lookup_indexes.sql`. Migration `001` enables PostgreSQL `pgcrypto`, which supplies `gen_random_uuid()` used by `002`; the database role must be allowed to create extensions. Run each migration against a reviewed database and use a versioned migration runner for deployment. `src/store.ts` uses parameterized PostgreSQL queries and database transactions for imports, deletion, and durable writes. Production reads and writes are direct row-level JSONB operations; it does not load or flush whole-map snapshots.

This release does not solve encryption/KMS, backups, restore drills, audit logging, secret rotation, or migration orchestration. Before production handling of financial data, provide managed PostgreSQL with encrypted storage and TLS, KMS-managed application-level encryption/key rotation if required by policy, automated tested backups and restore drills, restricted database credentials, monitoring/alerting, and a versioned migration runner. Apply both migrations in filename order with `-v ON_ERROR_STOP=1` against a reviewed database before deployment. Do not claim Anthropic or market providers are live until credentials, licensing, monitoring, and compliance review are complete.

API basics: `POST /v1/auth/register`, `POST /v1/auth/login`, then send `Authorization: Bearer <token>` from mobile or other shared API clients. The web client uses cookie-only auth: it sends credentialed requests, receives the `HttpOnly` `paisapilot_session` cookie, and checks `GET /v1/auth/session` after reload. Web auth responses intentionally omit the bearer token; bearer responses remain for mobile/shared API compatibility. The web client never reads or writes a financial bearer token in `localStorage`. `DELETE /v1/auth/session` revokes the current session and clears the cookie. User-owned endpoints reject missing or invalid sessions and only return records belonging to the authenticated user. Cookie-authenticated state-changing requests must include an exact allowlisted `Origin`; requests without a trusted origin are rejected with `403`, while bearer-only mobile requests are unaffected. Production cookie auth requires HTTPS, `SameSite=None; Secure`, an explicit `CORS_ORIGINS` allowlist, and credentialed CORS requests from those origins. Summary and health-score accept `month=YYYY-MM` plus an optional IANA `timezone`; when month is omitted they use that timezone (UTC by default), and return the selected period in the `X-Period` response header without changing the JSON contract.

AI processing is conditional: without `ANTHROPIC_API_KEY`, the API uses a local safe educational response and sends no prompt to Anthropic. With the key configured, the AI endpoint sends the prompt and limited summary facts to Anthropic. The per-user `aiEnabled` setting blocks `/v1/ai/answer` with `403` when false; responses are restricted to facts and estimates, not personalized allocation, tax, lending, or instrument advice.

## Web product

The Next.js TypeScript product shell lives in `app/` and consumes the shared contracts through `lib/api.ts`. It uses no client-side secrets or paid integrations. Copy `.env.local.example` to `.env.local` for the browser API URL, then run the API and web app in separate terminals:

```bash
npm run dev
npm run web:dev
```

Open `http://localhost:3001`. The production web domain is `https://paisapilot.app` and the expected API origin is `https://api.paisapilot.app`. Before deployment, set the browser-safe origin `NEXT_PUBLIC_API_URL=https://api.paisapilot.app` and configure the API with `CORS_ORIGINS=https://paisapilot.app`. These values are origins only, without a path or credentials; local development keeps the localhost defaults.
