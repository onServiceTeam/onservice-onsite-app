// Phase 14 Dispatch 06 — shared test helper for transactional rollback tests.
//
// The D06 standing instructions require every bug fix to include at least
// one test that mocks a query INSIDE the transaction to throw, then asserts
// that the function rejects (simulating ROLLBACK). The actual database is
// not exercised in unit tests — `db.transaction` is mocked so we can:
//
//   1. Capture every `client.query` call inside the callback (so we can
//      assert order + that no `db.query` mutations leak outside).
//   2. Inject a per-test failure on the Nth query to simulate any inserted/
//      updated row going wrong mid-transaction.
//   3. Verify the function rejects with the simulated error (would-be
//      ROLLBACK in production).
//
// Usage:
//   jest.mock('../../src/models/db', () => createDbMock());
//   import { db } from '../../src/models/db';
//   import { resetDbMock, getTxCalls, setTxQueryImpl, setTopQueryImpl } from '../helpers/d06-tx-mock';
//
//   beforeEach(resetDbMock);
//
// The mock factory must run lazily (inside the jest.mock callback) because
// jest hoists jest.mock to the top of the test file. We expose the helpers
// via the same module import so tests can configure per-test behavior.

import type { QueryResult, QueryResultRow } from 'pg';

type QueryArgs = { sql: string; params: unknown[] };
type QueryImpl = <R extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[],
) => Promise<QueryResult<R>>;

interface MockState {
  txCalls: QueryArgs[];
  topCalls: QueryArgs[];
  txQueryImpl: QueryImpl;
  topQueryImpl: QueryImpl;
  transactionInvocations: number;
}

const defaultEmptyResult = <R extends QueryResultRow = QueryResultRow>(): QueryResult<R> => ({
  command: '',
  rowCount: 0,
  oid: 0,
  fields: [],
  rows: [],
});

export const __state: MockState = {
  txCalls: [],
  topCalls: [],
  txQueryImpl: async <R extends QueryResultRow = QueryResultRow>() => defaultEmptyResult<R>(),
  topQueryImpl: async <R extends QueryResultRow = QueryResultRow>() => defaultEmptyResult<R>(),
  transactionInvocations: 0,
};

export function createDbMock() {
  return {
    db: {
      query: <R extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<QueryResult<R>> => {
        __state.topCalls.push({ sql, params: params ?? [] });
        return __state.topQueryImpl<R>(sql, params);
      },
      transaction: async <T>(
        callback: (client: {
          query: <R extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]) => Promise<QueryResult<R>>;
        }) => Promise<T>,
      ): Promise<T> => {
        __state.transactionInvocations += 1;
        const client = {
          query: <R extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<QueryResult<R>> => {
            __state.txCalls.push({ sql, params: params ?? [] });
            return __state.txQueryImpl<R>(sql, params);
          },
        };
        return callback(client);
      },
    },
  };
}

export function resetDbMock(): void {
  __state.txCalls = [];
  __state.topCalls = [];
  __state.transactionInvocations = 0;
  __state.txQueryImpl = async <R extends QueryResultRow = QueryResultRow>() => defaultEmptyResult<R>();
  __state.topQueryImpl = async <R extends QueryResultRow = QueryResultRow>() => defaultEmptyResult<R>();
}

export function setTxQueryImpl(impl: QueryImpl): void {
  __state.txQueryImpl = impl;
}

export function setTopQueryImpl(impl: QueryImpl): void {
  __state.topQueryImpl = impl;
}

export function getTxCalls(): QueryArgs[] {
  return __state.txCalls;
}

export function getTopCalls(): QueryArgs[] {
  return __state.topCalls;
}

export function getTransactionInvocations(): number {
  return __state.transactionInvocations;
}

/**
 * Build a router-style query implementation that matches each call against
 * a sequence of (regex, response) entries and returns the first match. If
 * the response is an Error instance, the implementation throws (simulating
 * a query failure mid-transaction). Useful for "succeed on the first 3
 * queries, fail on the 4th" rollback assertions.
 */
export function makeRouter(
  routes: Array<{
    match: RegExp;
    rows?: QueryResultRow[];
    rowCount?: number;
    throwError?: Error;
    onceOnly?: boolean;
  }>,
): QueryImpl {
  const consumed = new Set<number>();
  return async <R extends QueryResultRow = QueryResultRow>(
    sql: string,
    _params?: unknown[],
  ): Promise<QueryResult<R>> => {
    for (let i = 0; i < routes.length; i++) {
      if (routes[i]!.onceOnly && consumed.has(i)) continue;
      if (routes[i]!.match.test(sql)) {
        if (routes[i]!.onceOnly) consumed.add(i);
        const route = routes[i]!;
        if (route.throwError) throw route.throwError;
        return {
          ...defaultEmptyResult<R>(),
          rows: (route.rows ?? []) as R[],
          rowCount: route.rowCount ?? (route.rows?.length ?? 0),
        };
      }
    }
    return defaultEmptyResult<R>();
  };
}
