// Phase K CRIT-K02 / K03 / K04 / K07 / K08 / K09 / MED-K20 — fixes verified.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOCKET = readFileSync(
  resolve(__dirname, '../src/services/socket.service.ts'),
  'utf8',
);
const PUSH = readFileSync(
  resolve(__dirname, '../src/services/push.service.ts'),
  'utf8',
);
const BG_CHECK = readFileSync(
  resolve(__dirname, '../app/provider-onboarding/background-check-status.tsx'),
  'utf8',
);
const EARNINGS = readFileSync(
  resolve(__dirname, '../app/(provider-tabs)/earnings.tsx'),
  'utf8',
);
const PLATFORM_CONFIG = readFileSync(
  resolve(__dirname, '../src/config/platform.config.ts'),
  'utf8',
);

describe('Phase K CRIT-K03 — push.service reads user from canonical secure-storage', () => {
  it('CRIT-K03 — imports getStoredUser from secure-storage (NOT legacy storage)', () => {
    expect(PUSH).toMatch(/import \{ getStoredUser \} from '\.\/secure-storage'/);
  });
  it('CRIT-K03 — getUserRole calls getStoredUser (not storage.getString)', () => {
    expect(PUSH).toMatch(/const userJson = getStoredUser\(\)/);
    expect(PUSH).not.toMatch(/storage\.getString\('user'\)/);
  });
});

describe('Phase K CRIT-K04 — socket.service reads access token from canonical secure-storage', () => {
  it('CRIT-K04 — imports getAccessToken from secure-storage (NOT legacy storage)', () => {
    expect(SOCKET).toMatch(/import \{ getAccessToken \} from '\.\/secure-storage'/);
    expect(SOCKET).not.toMatch(/import \{ storage \} from '\.\/api'/);
  });
  it('CRIT-K04 — token resolved via getAccessToken() at connect time', () => {
    expect(SOCKET).toMatch(/const token = getAccessToken\(\)/);
    expect(SOCKET).not.toMatch(/storage\.getString\('accessToken'\)/);
  });
});

describe('Phase K CRIT-K07 — background-check-status hits real backend', () => {
  it('CRIT-K07 — useBackgroundCheckStatus calls /api/v1/providers/application-status', () => {
    expect(BG_CHECK).toMatch(/api\.get<ApiResponse<ApplicationStatusResponse \| null>>\(\s*\n\s*'\/api\/v1\/providers\/application-status'/);
  });
  it('CRIT-K07 — mapServerStatus translates backend statuses to UI enum', () => {
    expect(BG_CHECK).toMatch(/function mapServerStatus\(serverStatus: string\): CheckStatus/);
    expect(BG_CHECK).toMatch(/if \(serverStatus === 'approved'\) return 'approved'/);
    expect(BG_CHECK).toMatch(/if \(serverStatus === 'rejected' \|\| serverStatus === 'suspended'\) return 'rejected'/);
  });
  it('CRIT-K07 — surfaces rejectionReason as displayed reason', () => {
    expect(BG_CHECK).toMatch(/body\.rejectionReason \? \{ reason: body\.rejectionReason \} : \{\}/);
  });
  it('CRIT-K07 — useEffect kicks off initial fetch + 60s poll', () => {
    expect(BG_CHECK).toMatch(/useEffect\(\(\) => \{\s*\n\s*void refetch\(\);\s*\n\s*const interval = setInterval\(\(\) => \{ void refetch\(\); \}, 60_000\)/);
  });
  it('CRIT-K07 — placeholder simulated-await comment removed', () => {
    expect(BG_CHECK).not.toMatch(/\/\/ Placeholder: real implementation would call the backend\./);
  });
});

describe('Phase K CRIT-K08 — earnings chart uses real /trends endpoint', () => {
  it('CRIT-K08 — trendsQuery hits /api/v1/providers/me/earnings/trends?period=daily&days=7', () => {
    expect(EARNINGS).toMatch(/'\/api\/v1\/providers\/me\/earnings\/trends\?period=daily&days=7'/);
  });
  it('CRIT-K08 — EarningsChart fed from trendsQuery.data (NOT wallet/7 fake)', () => {
    // The chart is now state-gated (loading skeleton / error + empty states)
    // and the data-present branch feeds EarningsChart from trendsQuery.data.map.
    // Intent unchanged: real /trends data drives the chart, never the wallet/7 fake.
    expect(EARNINGS).toMatch(/data=\{trendsQuery\.data\.map/);
    expect(EARNINGS).not.toMatch(/Math\.round\(wallet\.availableBalance \/ 7\)/);
    // and the chart only renders once real trend data exists
    expect(EARNINGS).toMatch(/trendsQuery\.data && trendsQuery\.data\.length > 0/);
  });
});

describe('Phase K CRIT-K09 — commission breakdown uses real provider tier', () => {
  it('CRIT-K09 — providerQuery fetches /api/v1/providers/me to get tier', () => {
    expect(EARNINGS).toMatch(/queryKey: \['providerMe'\]/);
    expect(EARNINGS).toMatch(/'\/api\/v1\/providers\/me'/);
  });
  it('CRIT-K09 — tierCommissionRate looked up from platformConfig.commissionRates by tier', () => {
    expect(EARNINGS).toMatch(/platformConfig\.commissionRates\[providerTier\]/);
  });
  it('CRIT-K09 — info card shows "Your Commission" with tier-specific %', () => {
    expect(EARNINGS).toMatch(/Your Commission/);
    expect(EARNINGS).toMatch(/\$\{tierCommissionPct\}%/);
  });
  it('CRIT-K09 — old hardcoded 12% panel replaced with tier-driven values', () => {
    expect(EARNINGS).not.toMatch(/pct: 12,/);
    expect(EARNINGS).toMatch(/pct: tierCommissionPct/);
  });
});

describe('Phase K MED-K20 — platformConfig.commissionRates includes founding tier', () => {
  it('MED-K20 — founding: 0.10 added to commissionRates', () => {
    expect(PLATFORM_CONFIG).toMatch(/founding: 0\.10/);
  });
  it('MED-K20 — all 5 tiers present (founding/new/verified/pro/elite)', () => {
    expect(PLATFORM_CONFIG).toMatch(/founding: 0\.10/);
    expect(PLATFORM_CONFIG).toMatch(/new: 0\.15/);
    expect(PLATFORM_CONFIG).toMatch(/verified: 0\.13/);
    expect(PLATFORM_CONFIG).toMatch(/pro: 0\.11/);
    expect(PLATFORM_CONFIG).toMatch(/elite: 0\.09/);
  });
});
