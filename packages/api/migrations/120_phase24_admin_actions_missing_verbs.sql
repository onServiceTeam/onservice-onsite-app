-- Migration 120 — Phase 24a forensic audit fixes.
--
-- The Phase 24a audit-log forensic pass extracted every admin_actions verb
-- emitted by `packages/api/src/{routes,services}/**` and probed each against
-- the live CHECK constraint. 11 verbs the production code emits were
-- discovered to be REJECTED by the live CHECK:
--
--   1. consent_search                       — DPO consent search self-audit
--                                              (compliance-admin.routes.ts:69)
--                                              CRIT — every search 500's
--
--   2. audit_log_exported                   — CSV audit-log export self-audit
--                                              (compliance-admin.routes.ts:188)
--                                              CRIT — every export 500's
--
--   3. service_area_change_approved         — admin approves provider service-area change
--   4. service_area_change_rejected         — admin rejects same
--                                              (service-area-change.service.ts:201)
--                                              CRIT — admin decision 500's
--
--   5. provider_application_approved        — admin approves provider app
--   6. provider_application_rejected        — admin rejects provider app
--   7. provider_application_sent_back       — admin requests changes
--                                              (provider-onboarding.service.ts:307-318)
--                                              CRIT — provider onboarding decision 500's
--
--   8. admin_backup_codes_generated         — TOTP backup codes issued at enrollment
--   9. admin_backup_codes_regenerated       — TOTP backup codes regenerated
--                                              (admin-2fa.service.ts:128)
--                                              CRIT — admin 2FA enrollment 500's
--
--  10. bir_2307_batch_generated             — BIR 2307 quarterly batch
--  11. bir_2307_regenerated                 — BIR 2307 regen
--                                              (bir-2307.service.ts:473, 493)
--                                              MED — try/catch wrapped, audit row silently
--                                              dropped but request succeeds. Compliance gap:
--                                              we'd lose the audit trail for tax-doc generation.
--
-- Root cause: migration 119 (Phase 19) used DROP+ADD with an explicit verb
-- list. Verbs declared in earlier migrations 087/096/100/103 (which were
-- additive splices on the prior list) were not re-listed in 119, so they
-- were silently removed. Verbs added later in compliance-admin and bir-2307
-- routes/services were never added to any CHECK migration.
--
-- This migration adds all 11 verbs back, idempotently, using the same
-- splice-into-existing pattern as migration 116, so future widenings don't
-- regress again.

DO $migration_120$
DECLARE
  current_def TEXT;
  needs_widen BOOLEAN := FALSE;
  v TEXT;
  missing_verbs TEXT[] := ARRAY[
    'consent_search',
    'audit_log_exported',
    'service_area_change_approved',
    'service_area_change_rejected',
    'provider_application_approved',
    'provider_application_rejected',
    'provider_application_sent_back',
    'admin_backup_codes_generated',
    'admin_backup_codes_regenerated',
    'bir_2307_batch_generated',
    'bir_2307_regenerated'
  ];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO current_def
    FROM pg_constraint
   WHERE conname = 'admin_actions_action_type_check'
     AND conrelid = 'admin_actions'::regclass;

  IF current_def IS NULL THEN
    RAISE EXCEPTION 'admin_actions_action_type_check not found; cannot widen.';
  END IF;

  FOREACH v IN ARRAY missing_verbs LOOP
    IF position('''' || v || '''::character varying' IN current_def) = 0 THEN
      needs_widen := TRUE;
      EXIT;
    END IF;
  END LOOP;

  IF NOT needs_widen THEN
    RAISE NOTICE 'Migration 120 — no widening needed; all 11 verbs already present.';
    RETURN;
  END IF;

  ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_action_type_check;

  -- Rebuild as the union of (everything currently live) + (11 missing).
  -- We use the live CHECK output as the source of truth for "currently live"
  -- — that way migration order ambiguity can't drop anything else.
  ALTER TABLE admin_actions
    ADD CONSTRAINT admin_actions_action_type_check
    CHECK (action_type IN (
      -- preserved from migration 119 (current live set)
      'config_changed',
      'consent_version_published',
      'staff_added',
      'staff_removed',
      'staff_role_promoted_dpo',
      'staff_role_demoted_from_dpo',
      'admin_2fa_enrolled',
      'admin_2fa_disabled',
      'provider_approved',
      'provider_suspended',
      'provider_reinstated',
      'provider_tier_changed',
      'category_created',
      'category_updated',
      'subcategory_created',
      'subcategory_updated',
      'subcategory_deleted',
      'addon_created',
      'addon_updated',
      'addon_deleted',
      'feature_flag_toggled',
      'service_area_change_decided',
      'platform_setting_changed',
      'user_force_logout',
      'user_role_changed',
      'legacy_password_rotation_flagged',
      'admin_password_rotated',
      'service_category_created',
      'service_category_updated',
      'service_subcategory_created',
      'service_subcategory_updated',
      'service_subcategory_deleted',
      'service_addon_created',
      'service_addon_updated',
      'service_addon_deleted',
      'admin_backup_code_used',
      'admin_message_sent',
      'admin_role_archived',
      'aml_review_cleared',
      'booking_cancelled',
      'booking_force_completed',
      'booking_reassigned',
      'breach_logged',
      'breach_npc_notified',
      'breach_status_changed',
      'business_member_removed',
      'business_ownership_transferred',
      'customer_credited',
      'customer_flagged_fraud',
      'customer_reactivated',
      'customer_suspended',
      'dispute_assigned',
      'dispute_escalated',
      'dispute_message_sent',
      'dispute_reopened',
      'dispute_resolved',
      'dsr_more_info_requested',
      'dsr_rejected',
      'manual_escrow_release',
      'or_cancelled',
      'or_issued',
      'payout_approved',
      'payout_rejected',
      'provider_application_submitted',
      'provider_note_added',
      'provider_note_deleted',
      'provider_profile_updated',
      'provider_reactivated',
      'provider_rejected',
      'provider_wallet_adjusted',
      'reconciliation_alert_acknowledged',
      'reconciliation_run',
      'refund_from_escrow',
      'refund_issued',
      'release_escrow',
      'release_partial_escrow',
      'vat_report_finalized',
      'vat_report_generated',
      -- BUG-PHASE24-01..11 — verbs the code emits but were rejected
      'consent_search',
      'audit_log_exported',
      'service_area_change_approved',
      'service_area_change_rejected',
      'provider_application_approved',
      'provider_application_rejected',
      'provider_application_sent_back',
      'admin_backup_codes_generated',
      'admin_backup_codes_regenerated',
      'bir_2307_batch_generated',
      'bir_2307_regenerated'
    ));

  RAISE NOTICE 'Migration 120 applied: 11 missing admin_actions verbs added.';
END
$migration_120$;
