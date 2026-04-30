// Phase 14 Dispatch 08 — migrations smoke test.
// Bugs 117 (consent CHECK), 969 (marketing granular), 1366 (breach_log), 282 (admin saved filters).

import { readFileSync } from 'fs';
import { resolve } from 'path';

const M080 = readFileSync(resolve(__dirname, '../../migrations/080_d08_consent_type_check.sql'), 'utf8');
const M081 = readFileSync(resolve(__dirname, '../../migrations/081_d08_marketing_consent_granular.sql'), 'utf8');
const M082 = readFileSync(resolve(__dirname, '../../migrations/082_d08_breach_log.sql'), 'utf8');
const M083 = readFileSync(resolve(__dirname, '../../migrations/083_d08_admin_user_preferences.sql'), 'utf8');

describe('Bug 117 — migration 080 consent_records.consent_type CHECK', () => {
  it('adds CHECK constraint with valid types', () => {
    expect(M080).toMatch(/ADD CONSTRAINT consent_records_type_valid CHECK/);
    expect(M080).toMatch(/'privacy_policy'/);
    expect(M080).toMatch(/'terms_of_service'/);
    expect(M080).toMatch(/'marketing_consent'/);
    expect(M080).toMatch(/'ic_agreement'/);
    expect(M080).toMatch(/'biometric_consent'/);
  });

  it('defensively fixes existing typos before adding the constraint', () => {
    expect(M080).toMatch(/UPDATE consent_records[\s\S]*priacy_policy/);
    expect(M080).toMatch(/UPDATE consent_records[\s\S]*terms-of-service/);
  });
});

describe('Bug 969 — migration 081 marketing consent granular', () => {
  it('adds per-channel marketing flags + acknowledged_at + version', () => {
    expect(M081).toMatch(/marketing_push_enabled BOOLEAN/);
    expect(M081).toMatch(/marketing_sms_enabled BOOLEAN/);
    expect(M081).toMatch(/marketing_email_enabled BOOLEAN/);
    expect(M081).toMatch(/marketing_consent_acknowledged_at TIMESTAMPTZ/);
    expect(M081).toMatch(/marketing_consent_version INTEGER/);
  });

  it('backfills push + email from existing promotions boolean (SMS stays false)', () => {
    expect(M081).toMatch(/UPDATE notification_preferences[\s\S]*marketing_push_enabled = COALESCE\(promotions, FALSE\)/);
    expect(M081).toMatch(/marketing_email_enabled = COALESCE\(promotions, FALSE\)/);
    // SMS NOT backfilled — explicit consent only.
    expect(M081).not.toMatch(/marketing_sms_enabled = COALESCE\(promotions, FALSE\)/);
  });

  it('creates partial indexes for fast eligible-audience lookup per channel', () => {
    expect(M081).toMatch(/idx_notif_pref_marketing_push[\s\S]*WHERE marketing_push_enabled = TRUE/);
    expect(M081).toMatch(/idx_notif_pref_marketing_sms/);
    expect(M081).toMatch(/idx_notif_pref_marketing_email/);
  });
});

describe('Bug 1366 — migration 082 breach_log + admin_actions verb extensions', () => {
  it('creates breach_log table with type CHECK + status CHECK', () => {
    expect(M082).toMatch(/CREATE TABLE breach_log/);
    expect(M082).toMatch(/CHECK \(type IN/);
    expect(M082).toMatch(/CHECK \(status IN/);
  });

  it('captures the 72h SLA prerequisites: occurred_at + discovered_at + npc_notified_at + npc_reference', () => {
    expect(M082).toMatch(/occurred_at TIMESTAMPTZ NOT NULL/);
    expect(M082).toMatch(/discovered_at TIMESTAMPTZ NOT NULL/);
    expect(M082).toMatch(/npc_notified_at TIMESTAMPTZ/);
    expect(M082).toMatch(/npc_reference TEXT/);
  });

  it('enforces npc_reference IS NOT NULL when npc_notified_at IS NOT NULL', () => {
    expect(M082).toMatch(/CHECK \(\(npc_notified_at IS NULL\) OR \(npc_reference IS NOT NULL\)\)/);
  });

  it('partial index for pending-NPC drives cron + admin needs-attention view', () => {
    expect(M082).toMatch(/idx_breach_pending_npc[\s\S]*WHERE npc_notified_at IS NULL/);
  });

  it('extends admin_actions verbs (D08 additions): pii_reveal, breach_logged, breach_npc_notified, audit_log_exported, consent_search, dsr_action_dispatched', () => {
    expect(M082).toMatch(/'audit_log_exported'/);
    expect(M082).toMatch(/'consent_search'/);
    expect(M082).toMatch(/'pii_reveal'/);
    expect(M082).toMatch(/'breach_logged'/);
    expect(M082).toMatch(/'breach_npc_notified'/);
    expect(M082).toMatch(/'dsr_action_dispatched'/);
  });

  it('extends admin_actions target types: system, user, admin_actions, breach', () => {
    expect(M082).toMatch(/'system'/);
    expect(M082).toMatch(/'user'/);
    expect(M082).toMatch(/'admin_actions'/);
    expect(M082).toMatch(/'breach'/);
  });
});

describe('Bug 282 — migration 083 admin_user_preferences', () => {
  it('creates admin_user_preferences table with JSONB filters', () => {
    expect(M083).toMatch(/CREATE TABLE admin_user_preferences/);
    expect(M083).toMatch(/saved_filters JSONB NOT NULL/);
  });

  it('unique partial index ensures one default per (admin_user, page_key)', () => {
    expect(M083).toMatch(/CREATE UNIQUE INDEX idx_admin_user_prefs_default[\s\S]*WHERE is_default = TRUE/);
  });
});

describe('D08 migrations — file presence + structure', () => {
  it.each([['080', M080], ['081', M081], ['082', M082], ['083', M083]])(
    'migration %s wraps in BEGIN/COMMIT and references Phase 14 Dispatch 08',
    (_n, sql) => {
      expect(sql).toMatch(/^BEGIN;/m);
      expect(sql).toMatch(/^COMMIT;/m);
      expect(sql).toMatch(/Phase 14 Dispatch 08/i);
    },
  );
});
