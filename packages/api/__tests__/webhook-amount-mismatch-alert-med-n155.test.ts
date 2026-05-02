// MED-N155 fix verified — webhook payment.amount mismatch is now
// surfaced via Sentry capture + security_events audit row in addition
// to the original logger.error.
//
// Pre-fix: PayMongo sending a different amount than the recorded
// payment intent only logged via logger.error and break'd out of the
// switch. Potential payment-tampering signal went unnoticed by ops
// and the admin Compliance dashboard.
//
// Post-fix: same path also calls Sentry.captureMessage and
// securityService.logSecurityEvent({eventType: 'payment_amount_mismatch'}).
// Both alerting calls are wrapped in try/catch so an alerting-side
// failure cannot mask the original mismatch.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/webhook.routes.ts'),
  'utf8',
);

describe('MED-N155 — webhook amount mismatch alerting', () => {
  it('imports @sentry/node', () => {
    expect(ROUTES).toMatch(/import \* as Sentry from '@sentry\/node'/);
  });

  it('imports securityService for the security_events audit', () => {
    expect(ROUTES).toMatch(/import \* as securityService from '\.\.\/services\/security\.service'/);
  });

  it('the amount-mismatch branch captures to Sentry', () => {
    // Anchor on the mismatch literal so we don't accidentally pass on
    // an unrelated Sentry call elsewhere.
    expect(ROUTES).toMatch(/Webhook payment\.amount mismatch/);
    expect(ROUTES).toMatch(/Sentry\.captureMessage\(\s*'Webhook payment\.amount mismatch'/);
  });

  it('the amount-mismatch branch logs a payment_amount_mismatch security event', () => {
    expect(ROUTES).toMatch(/securityService\.logSecurityEvent\(\{[\s\S]{0,200}eventType:\s*'payment_amount_mismatch'/);
  });

  it('Sentry capture is wrapped in try/catch (alerting failure must not mask the mismatch)', () => {
    // Source-level signature: the capture sits inside a try block and
    // a sibling catch downgrades to logger.warn.
    expect(ROUTES).toMatch(/try \{\s*Sentry\.captureMessage[\s\S]*?catch \(sentryErr\)/);
    expect(ROUTES).toMatch(/Sentry capture failed for amount mismatch/);
  });

  it('security_events insert is wrapped in try/catch', () => {
    expect(ROUTES).toMatch(/try \{\s*await securityService\.logSecurityEvent[\s\S]*?catch \(auditErr\)/);
    expect(ROUTES).toMatch(/security_events insert failed for amount mismatch/);
  });

  it('the metadata captured includes both webhookAmount and intentAmount + delta', () => {
    expect(ROUTES).toMatch(/webhookAmount:\s*Number\(webhookAmount\)/);
    expect(ROUTES).toMatch(/intentAmount:\s*Number\(intent\.amount\)/);
    expect(ROUTES).toMatch(/deltaCentavos:\s*Number\(webhookAmount\) - Number\(intent\.amount\)/);
  });

  it('the original logger.error remains as a primary record', () => {
    expect(ROUTES).toMatch(/logger\.error\('Webhook amount mismatch — POSSIBLE TAMPERING'/);
  });
});

describe('MED-N155 — migration 095 adds payment_amount_mismatch to security_events CHECK', () => {
  const MIGRATION = readFileSync(
    resolve(__dirname, '../migrations/095_payment_amount_mismatch_event.sql'),
    'utf8',
  );

  it('migration drops then re-adds the CHECK constraint with the new value', () => {
    expect(MIGRATION).toMatch(/DROP CONSTRAINT security_events_event_type_check/);
    expect(MIGRATION).toMatch(/ADD CONSTRAINT security_events_event_type_check/);
  });

  it("'payment_amount_mismatch' is in the new allowed event_type list", () => {
    expect(MIGRATION).toMatch(/'payment_amount_mismatch'/);
  });

  it('preserves all 10 pre-existing event types (no regression)', () => {
    for (const t of [
      'otp_lockout', 'ip_blocked', 'ip_unblocked',
      'new_device_login', 'suspicious_activity',
      'admin_login', 'admin_login_failed',
      'account_deactivated', 'captcha_required', 'captcha_failed',
    ]) {
      expect(MIGRATION).toMatch(new RegExp(`'${t}'`));
    }
  });
});
