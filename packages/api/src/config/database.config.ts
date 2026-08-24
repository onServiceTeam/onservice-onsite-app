import { Pool, PoolConfig } from 'pg';
import { logger } from '../utils/logger';
import './pg-types.config';
import { resolveDatabaseSsl } from './database-ssl.config';

// Phase 13 Dispatch E: BIGINT (OID 20) → JS Number.
// Approved Option B per .ai-coder/checkpoints/logs/PHASE-13/dispatch-E/bigint-inventory.md §5.
// Safe ceiling per single value: Number.MAX_SAFE_INTEGER (~₱90T centavos).
// Aggregator columns approaching ₱1T cumulative GMV must switch to BigInt-end-to-end.
// See docs/MONEY-HANDLING.md and LAUNCH-LIMITATIONS.md §15-§16.
// pg-types skips NULLs (the parser is only invoked for non-null text values).
// OPS-203 — make the transport policy match the deployed topology. The API
// reaches PgBouncer over a private Compose network, while managed/external
// databases require TLS. resolveDatabaseSsl fails closed if production tries
// to disable TLS for anything except the known local/Compose hosts.
const databaseSsl = resolveDatabaseSsl();
if (process.env.NODE_ENV === 'production' && databaseSsl.mode === 'disable') {
  logger.info('Database TLS disabled for the private self-hosted PgBouncer transport');
}

const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  min: Number(process.env.DB_POOL_MIN) || 2,
  max: Number(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: databaseSsl.ssl,
};

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  logger.error('Unexpected database pool error', { error: err.message });
});

pool.on('connect', () => {
  logger.debug('New database connection established');
});
