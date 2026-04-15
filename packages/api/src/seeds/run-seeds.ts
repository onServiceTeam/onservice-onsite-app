import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../config/database.config';
import { logger } from '../utils/logger';

const SEEDS_DIR = path.resolve(import.meta.dirname, '../../seeds');

async function runSeeds(): Promise<void> {
  const files = fs.readdirSync(SEEDS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    logger.warn('No seed files found in seeds/');
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const file of files) {
      const filePath = path.join(SEEDS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf-8');
      logger.info(`Running seed: ${file}`);
      await client.query(sql);
    }

    await client.query('COMMIT');
    logger.info(`Successfully ran ${files.length} seed file(s)`);
  } catch (error) {
    await client.query('ROLLBACK');
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Seed failed — rolled back', { error: err.message });
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runSeeds().catch(() => process.exit(1));
