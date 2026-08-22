import * as pgTypes from 'pg-types';

/**
 * Register the API's PostgreSQL wire-format conversions without creating a
 * database connection pool. Keeping this side effect separate lets unit tests
 * verify the BIGINT contract without opening network handles.
 */
export function registerPgTypeParsers(): void {
  pgTypes.setTypeParser(20, (value: string) => Number(value));
}

registerPgTypeParsers();
