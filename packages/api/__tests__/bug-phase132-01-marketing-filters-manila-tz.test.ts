// BUG-PHASE132-01 — marketing-admin.service.ts had two listing surfaces
// (listCampaigns and getMarketingOverview) that interpreted from/to
// date filters as UTC midnight, not Manila midnight, AND used `<= date`
// for the to-bound which excludes 16 hours of the to-day.
//
// Pre-fix:
//   started_at >= $N    -- $N = 'YYYY-MM-DD', Pg treats as UTC midnight
//   started_at <= $N    -- inclusive UTC midnight, excludes most of the day
//
// In Manila terms (UTC+08:00):
//   from='2026-05-01' filtered from 08:00 Manila on May 1 onwards
//   — campaigns started at 00:00-08:00 Manila on May 1 were missed
//   to='2026-05-31' filtered up to 08:00 Manila on May 31
//   — campaigns started at 08:00-23:59 Manila on May 31 were excluded
//   That's a 16-hour blind spot at the to-end every query.
//
// Post-fix:
//   started_at >= ($N::date AT TIME ZONE 'Asia/Manila')                       -- inclusive Manila midnight
//   started_at <  (($N::date + INTERVAL '1 day') AT TIME ZONE 'Asia/Manila')  -- half-open: includes whole to-day
//
// Same Manila TZ correction shape as Phases 109/113/117/119/122/123/
// 124/129/130 — Manila is the canonical TZ for the launch market.
//
// Test strategy: mock db.query, call the service surface, assert on
// the SQL fragment that gets emitted. Boundary correctness is proven
// by the SQL idiom — Pg's TZ semantics do the actual computation.

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import * as svc from '../src/services/marketing-admin.service';
import { db } from '../src/models/db';

const dbQueryMock = db.query as jest.MockedFunction<typeof db.query>;

function rows<T>(data: T[]): { rows: T[] } {
  return { rows: data };
}

beforeEach(() => {
  dbQueryMock.mockReset();
});

describe('BUG-PHASE132-01 — listCampaigns uses Manila-anchored half-open from/to filter', () => {
  it('emits Manila-anchored from-bound', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ cnt: '0' }]))
      .mockResolvedValueOnce(rows([]));
    await svc.listCampaigns({ from: '2026-05-01' });
    const countSql = dbQueryMock.mock.calls[0][0] as string;
    expect(countSql).toMatch(/started_at >= \(\$1::date AT TIME ZONE 'Asia\/Manila'\)/);
    // Pre-fix would emit the broken `started_at >= $1` (no TZ cast).
    expect(countSql).not.toMatch(/started_at >= \$1\b/);
  });

  it('emits Manila-anchored half-open to-bound', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ cnt: '0' }]))
      .mockResolvedValueOnce(rows([]));
    await svc.listCampaigns({ to: '2026-05-31' });
    const countSql = dbQueryMock.mock.calls[0][0] as string;
    expect(countSql).toMatch(
      /started_at < \(\(\$1::date \+ INTERVAL '1 day'\) AT TIME ZONE 'Asia\/Manila'\)/,
    );
    // Pre-fix would emit `started_at <= $1` — explicitly assert that's gone.
    expect(countSql).not.toMatch(/started_at <= \$1\b/);
  });

  it('emits both bounds when both supplied', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ cnt: '0' }]))
      .mockResolvedValueOnce(rows([]));
    await svc.listCampaigns({ from: '2026-05-01', to: '2026-05-31' });
    const countSql = dbQueryMock.mock.calls[0][0] as string;
    expect(countSql).toMatch(/started_at >= \(\$1::date AT TIME ZONE 'Asia\/Manila'\)/);
    expect(countSql).toMatch(
      /started_at < \(\(\$2::date \+ INTERVAL '1 day'\) AT TIME ZONE 'Asia\/Manila'\)/,
    );
  });

  it('rejects malformed date strings (regression guard for validateDateString)', async () => {
    await expect(svc.listCampaigns({ from: 'tomorrow' })).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(svc.listCampaigns({ to: '2026/05/31' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe('BUG-PHASE132-01 — getMarketingOverview uses Manila-anchored half-open from/to filter', () => {
  it('emits Manila-anchored from-bound', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await svc.getMarketingOverview('2026-05-01');
    const sql = dbQueryMock.mock.calls[0][0] as string;
    expect(sql).toMatch(/started_at >= \(\$1::date AT TIME ZONE 'Asia\/Manila'\)/);
  });

  it('emits Manila-anchored half-open to-bound', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await svc.getMarketingOverview(undefined, '2026-05-31');
    const sql = dbQueryMock.mock.calls[0][0] as string;
    expect(sql).toMatch(
      /started_at < \(\(\$1::date \+ INTERVAL '1 day'\) AT TIME ZONE 'Asia\/Manila'\)/,
    );
  });
});
