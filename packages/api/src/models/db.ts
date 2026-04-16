import { pool } from '../config/database.config';
import { QueryResult, QueryResultRow } from 'pg';

/**
 * Database helper — wraps pg pool with typed queries.
 * ALL queries use parameterized statements (never string concatenation).
 */
export const db = {
  query: <T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>> => {
    return pool.query<T>(text, params);
  },

  /**
   * Execute multiple queries in a single transaction.
   * ALL OR NOTHING — if any query fails, the entire transaction rolls back.
   */
  transaction: async <T>(
    callback: (client: {
      query: <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<QueryResult<R>>;
    }) => Promise<T>,
  ): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback({
        query: <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => client.query<R>(text, params),
      });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
};
