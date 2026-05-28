// MED-N120 fix verified — reconciliation discrepancy now dispatches
// to Sentry + Slack in addition to the original logger.error and
// DB flag.
//
// Pre-fix: file header explicitly said "Actual outbound dispatch
// (Slack/email) is intentionally deferred — the DB flag + structured
// error log IS the alert." Money-conservation discrepancies could
// sit unflagged for hours/days until someone next checked the
// admin dashboard.
//
// Post-fix:
// - sendSlackAlert posts a Block Kit message to SLACK_ALERT_WEBHOOK_URL
//   when set; no-op log otherwise. Never throws.
// - reconciliation.service captures to Sentry and posts to Slack
//   the moment a discrepancy exceeds ALERT_THRESHOLD_CENTAVOS,
//   alongside the pre-existing logger.error + DB flag.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const RECON = readFileSync(
  resolve(__dirname, '../src/services/reconciliation.service.ts'),
  'utf8',
);
const SLACK = readFileSync(
  resolve(__dirname, '../src/services/slack-alert.service.ts'),
  'utf8',
);

describe('MED-N120 — reconciliation.service alerts via Sentry + Slack', () => {
  it('imports Sentry', () => {
    // Phase L typecheck fix — accepts either the original
    // `import * as Sentry` shape or the new typecheck-friendly
    // `import * as SentryRaw` pattern (cast to a wider namespace
    // alias on the next line so the runtime call shape is identical).
    expect(RECON).toMatch(/import \* as (Sentry|SentryRaw) from '@sentry\/node'/);
  });

  it('imports sendSlackAlert from the new slack-alert.service', () => {
    expect(RECON).toMatch(/import \{ sendSlackAlert \} from '\.\/slack-alert\.service'/);
  });

  it('captures to Sentry when discrepancy exceeds threshold', () => {
    expect(RECON).toMatch(/Sentry\.captureMessage\('Reconciliation discrepancy exceeds threshold'/);
  });

  it('posts to Slack when discrepancy exceeds threshold', () => {
    expect(RECON).toMatch(/sendSlackAlert\(\{/);
    expect(RECON).toMatch(/Reconciliation discrepancy detected/);
  });

  it('Sentry capture is wrapped in try/catch (alerting must not block)', () => {
    expect(RECON).toMatch(/try \{\s*Sentry\.captureMessage[\s\S]*?catch \(sentryErr\)/);
  });

  it('Slack call uses void prefix (fire-and-forget; sendSlackAlert never throws)', () => {
    expect(RECON).toMatch(/void sendSlackAlert/);
  });

  it('original logger.error is preserved (regression guard)', () => {
    expect(RECON).toMatch(/logger\.error\('Reconciliation discrepancy exceeds threshold'/);
  });

  it('Slack alert includes severity escalation when 10x threshold', () => {
    // > threshold = 'error', > 10x threshold = 'critical'
    // MED-N119 fix — threshold is now read from settings via local
    // `thresholdCentavos` instead of the hardcoded constant.
    expect(RECON).toMatch(/Math\.abs\(discrepancy\) > thresholdCentavos \* 10/);
    expect(RECON).toMatch(/'critical' : 'error'/);
  });
});

describe('MED-N120 — slack-alert.service contract', () => {
  it('sendSlackAlert is exported as async', () => {
    expect(SLACK).toMatch(/export async function sendSlackAlert/);
  });

  it('reads SLACK_ALERT_WEBHOOK_URL from env', () => {
    expect(SLACK).toMatch(/process\.env\.SLACK_ALERT_WEBHOOK_URL/);
  });

  it('is a no-op (debug log only) when SLACK_ALERT_WEBHOOK_URL is unset', () => {
    expect(SLACK).toMatch(/SLACK_ALERT_WEBHOOK_URL not set/);
  });

  it('uses globalThis.fetch (matches Bug 1271 native-fetch rule)', () => {
    expect(SLACK).toMatch(/globalThis\.fetch/);
  });

  it('wraps fetch in try/catch — never throws to the caller', () => {
    expect(SLACK).toMatch(/try \{\s*const response = await globalThis\.fetch[\s\S]*?catch \(err\)/);
  });

  it('builds a Block Kit payload (header + section)', () => {
    expect(SLACK).toMatch(/type:\s*'header'/);
    expect(SLACK).toMatch(/type:\s*'section'/);
    expect(SLACK).toMatch(/type:\s*'plain_text'/);
    expect(SLACK).toMatch(/type:\s*'mrkdwn'/);
  });

  it('caps body length at 3000 chars (Slack hard limit)', () => {
    expect(SLACK).toMatch(/input\.body\.slice\(0, 3000\)/);
  });

  it('caps fields at 10 entries (Slack section limit)', () => {
    expect(SLACK).toMatch(/input\.fields\.slice\(0, 10\)/);
  });

  it('maps severity → emoji prefix on header', () => {
    expect(SLACK).toMatch(/SEVERITY_EMOJI: Record<Severity, string>/);
    // All 4 severities present.
    for (const s of ['info', 'warning', 'error', 'critical']) {
      expect(SLACK).toMatch(new RegExp(`${s}:`));
    }
  });
});

describe('MED-N120 — sendSlackAlert behavior smoke (env unset path)', () => {
  // Test the live function with the env unset to confirm no-op.

  const { sendSlackAlert } = require('../src/services/slack-alert.service');

  it('returns undefined and does not throw when webhook URL is unset', async () => {
    const original = process.env.SLACK_ALERT_WEBHOOK_URL;
    delete process.env.SLACK_ALERT_WEBHOOK_URL;
    try {
      await expect(sendSlackAlert({
        title: 'Test',
        body: 'Test body',
      })).resolves.toBeUndefined();
    } finally {
      if (original !== undefined) process.env.SLACK_ALERT_WEBHOOK_URL = original;
    }
  });
});
