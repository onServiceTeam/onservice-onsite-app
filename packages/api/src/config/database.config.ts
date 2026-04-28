import { Pool, PoolConfig } from 'pg';
import * as pgTypes from 'pg-types';
import { logger } from '../utils/logger';

// Phase 13 Dispatch E: BIGINT (OID 20) → JS Number.
// Approved Option B per .ai-coder/checkpoints/logs/PHASE-13/dispatch-E/bigint-inventory.md §5.
// Safe ceiling per single value: Number.MAX_SAFE_INTEGER (~₱90T centavos).
// Aggregator columns approaching ₱1T cumulative GMV must switch to BigInt-end-to-end.
// See docs/MONEY-HANDLING.md and LAUNCH-LIMITATIONS.md §15-§16.
// pg-types skips NULLs (the parser is only invoked for non-null text values).
pgTypes.setTypeParser(20, (val: string) => Number(val));

const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  min: Number(process.env.DB_POOL_MIN) || 2,
  max: Number(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  logger.error('Unexpected database pool error', { error: err.message });
});

pool.on('connect', () => {
  logger.debug('New database connection established');
});
