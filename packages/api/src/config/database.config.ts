import { Pool, PoolConfig } from 'pg';
import { logger } from '../utils/logger';
import './pg-types.config';

// Phase 13 Dispatch E: BIGINT (OID 20) → JS Number.
// Approved Option B per .ai-coder/checkpoints/logs/PHASE-13/dispatch-E/bigint-inventory.md §5.
// Safe ceiling per single value: Number.MAX_SAFE_INTEGER (~₱90T centavos).
// Aggregator columns approaching ₱1T cumulative GMV must switch to BigInt-end-to-end.
// See docs/MONEY-HANDLING.md and LAUNCH-LIMITATIONS.md §15-§16.
// pg-types skips NULLs (the parser is only invoked for non-null text values).
// MED-M14 fix — explicit SSL config for production.
// Pre-fix: poolConfig had no `ssl` key, so the pool relied entirely
// on `?sslmode=` in DATABASE_URL. If the env var lacked the param
// (typo, copy-paste, dev URL accidentally promoted to prod), the
// pool silently established plaintext connections — admin
// credentials and PII over the wire.
//
// Post-fix:
//   - In production, ssl is REQUIRED. We default to
//     { rejectUnauthorized: true } unless DB_SSL_REJECT_UNAUTHORIZED
//     is explicitly set to 'false' (e.g. for self-signed RDS staging).
//   - In non-prod (development, test), ssl is disabled by default to
//     keep local Postgres simple.
//   - DATABASE_URL is parsed for sslmode=require/verify-ca/verify-full;
//     if production and no sslmode found, log a warning so operators
//     can fix the env var.
function buildSslConfig(): PoolConfig['ssl'] {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) return false;
  const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';
  return { rejectUnauthorized };
}

if (
  process.env.NODE_ENV === 'production' &&
  !(process.env.DATABASE_URL ?? '').match(/sslmode=(require|verify-ca|verify-full)/)
) {
  logger.warn(
    'DATABASE_URL does not specify sslmode=require/verify-ca/verify-full in production. SSL is enforced via pool config but URL-level sslmode is recommended.',
  );
}

const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  min: Number(process.env.DB_POOL_MIN) || 2,
  max: Number(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: buildSslConfig(),
};

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  logger.error('Unexpected database pool error', { error: err.message });
});

pool.on('connect', () => {
  logger.debug('New database connection established');
});
