-- UUID defaults in later migrations require PostgreSQL's pgcrypto extension.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS accounts (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS transactions (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, data jsonb NOT NULL);
CREATE INDEX IF NOT EXISTS transactions_user_date_idx ON transactions(user_id, ((data->>'occurredOn')));
CREATE TABLE IF NOT EXISTS imports (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, fingerprint text NOT NULL, transaction_id uuid REFERENCES transactions(id) ON DELETE CASCADE, UNIQUE(user_id, account_id, fingerprint));
CREATE TABLE IF NOT EXISTS goals (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS budgets (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS loans (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS settings (user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data jsonb NOT NULL);