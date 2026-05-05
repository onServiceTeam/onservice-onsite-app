// Phase N MED-N59/N98/N169 — fixes verified.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const NOTIFICATION = readFileSync(
  resolve(__dirname, '../src/services/notification.service.ts'),
  'utf8',
);
const PROVIDER_ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/provider.routes.ts'),
  'utf8',
);
const WEBHOOK = readFileSync(
  resolve(__dirname, '../src/routes/webhook.routes.ts'),
  'utf8',
);

describe('Phase N MED-N59 — provider_cancelled distinct notification type', () => {
  it('N59 — NotificationType union includes provider_cancelled', () => {
    expect(NOTIFICATION).toMatch(/'customer_cancelled' \| 'provider_cancelled'/);
  });
  it('N59 — statusToType maps cancelled_by_provider to provider_cancelled', () => {
    expect(NOTIFICATION).toMatch(/cancelled_by_provider: 'provider_cancelled'/);
  });
  it('N59 — pre-fix dual mapping to customer_cancelled removed', () => {
    expect(NOTIFICATION).not.toMatch(/cancelled_by_provider: 'customer_cancelled'/);
  });
});

describe('Phase N MED-N98 — monthly-summary year clamp allows next year', () => {
  it('N98 — pre-fix `Math.min(now.getFullYear(), …)` clamp removed', () => {
    expect(PROVIDER_ROUTES).not.toMatch(
      /Math\.max\(2024, Math\.min\(now\.getFullYear\(\), Number\(req\.query\.year\) \|\| now\.getFullYear\(\)\)\)/,
    );
  });
  it('N98 — new safeYear allows up to current year + 1', () => {
    // BUG-PHASE121-01 — pre-fix this used `now.getFullYear()` which
    // is server-local UTC. Anchored to Manila now (manilaYear). The
    // upper bound is still "current year + 1" — just the right
    // year for an admin in Manila.
    expect(PROVIDER_ROUTES).toMatch(/requestedYear <= manilaYear \+ 1/);
  });
  it('N98 — sanitizes non-finite year input back to current year', () => {
    expect(PROVIDER_ROUTES).toMatch(/Number\.isFinite\(requestedYear\)/);
  });
});

describe('Phase N MED-N169 — webhook returns 503 (not 401) when secret missing', () => {
  it('N169 — WebhookSecretMissingError sentinel introduced', () => {
    expect(WEBHOOK).toMatch(/class WebhookSecretMissingError extends Error/);
  });
  it('N169 — verifyWebhookSignature throws (no longer returns false) on missing secret', () => {
    expect(WEBHOOK).toMatch(/throw new WebhookSecretMissingError/);
  });
  it('N169 — route catches the sentinel and returns 503', () => {
    expect(WEBHOOK).toMatch(/err instanceof WebhookSecretMissingError/);
    expect(WEBHOOK).toMatch(/res\.status\(503\)/);
  });
});
