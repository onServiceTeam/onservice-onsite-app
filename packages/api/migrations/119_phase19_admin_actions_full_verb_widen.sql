-- Migration 119 — Phase 19 BUG-PHASE19-01 / -02 fix.
--
-- Symptom: nearly every admin write past the basic provider/staff/catalog
-- ones returned 500 in production. The Phase 18 catalog widening (mig 118)
-- only covered 8 verbs; this round catches the rest. Specifically broken:
--   - Admin booking cancel / reassign / force-complete / manual escrow release
--     / refund issuance — every booking governance path
--   - Dispute assign / escalate / resolve / reopen / message_sent
--   - Customer suspend / reactivate / flag-fraud / credit
--   - Provider reject / reactivate (vs reinstated alias) / note CRUD /
--     wallet adjust / profile update / application submitted
--   - Payout approve / reject
--   - Compliance: DSR rejected / more-info-requested
--   - Breach logging (logged / npc_notified / status_changed)
--   - Business member removal / ownership transfer
--   - BIR ops (or_cancelled, vat_report_generated/finalized)
--   - 2FA backup code use, admin role archive, AML review cleared
--   - Manual reconciliation alert acknowledged + run
--   - Notification-template DELETE (target_type='notification_template' missing)
--   - Pricing rule, promotion, support_ticket, service_area target_types
--
-- Root cause: the Phase 14 unit tests for these features all ran against
-- mocks (jest in-memory DB stubs), not real Postgres. The CHECK violation
-- never fired in unit tests; production-shape testing (Phase 19) caught
-- 35 missing action_type verbs and 6 missing target_type values.
--
-- Why widen the CHECK rather than relax it: the CHECK is the audit-log
-- governance contract — an admin can't write a verb the platform doesn't
-- recognize. Removing it (or making it 'any text') would let typos slip
-- through silently and break the audit-log filter UI. Widening with the
-- real verbs the code uses preserves the contract while unblocking ops.
--
-- Pattern: introspection-based ALTER. If both lists already contain
-- everything the code writes, the migration is a no-op (re-runnable).

DO $migration_119$
DECLARE
  curr_action_def text;
  curr_target_def text;
  needs_action boolean := false;
  needs_target boolean := false;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO curr_action_def
    FROM pg_constraint c
   WHERE c.conrelid = 'admin_actions'::regclass
     AND c.conname = 'admin_actions_action_type_check';

  SELECT pg_get_constraintdef(c.oid) INTO curr_target_def
    FROM pg_constraint c
   WHERE c.conrelid = 'admin_actions'::regclass
     AND c.conname = 'admin_actions_target_type_check';

  IF curr_action_def IS NULL OR curr_target_def IS NULL THEN
    RAISE EXCEPTION 'admin_actions CHECK constraints not found; cannot widen';
  END IF;

  -- Sample-check (full check is below — these are sentinels)
  IF curr_action_def NOT LIKE '%booking_cancelled%' THEN needs_action := true; END IF;
  IF curr_target_def NOT LIKE '%notification_template%' THEN needs_target := true; END IF;

  IF NOT needs_action AND NOT needs_target THEN
    RAISE NOTICE 'Migration 119 — no widening needed; all verbs already present.';
    RETURN;
  END IF;

  -- Drop + recreate action_type CHECK with the union of existing + missing.
  ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_action_type_check;
  ALTER TABLE admin_actions
    ADD CONSTRAINT admin_actions_action_type_check
    CHECK (action_type IN (
      -- existing (preserved)
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
      -- BUG-PHASE19-01 new entries
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
      'vat_report_generated'
    ));

  -- Drop + recreate target_type CHECK with the union.
  ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_target_type_check;
  ALTER TABLE admin_actions
    ADD CONSTRAINT admin_actions_target_type_check
    CHECK (target_type IN (
      -- existing (preserved verbatim)
      'provider',
      'customer',
      'booking',
      'dispute',
      'payout',
      'config',
      'official_receipt',
      'bir_2307_batch',
      'vat_report',
      'reconciliation',
      'dsr_request',
      'consent_version',
      'message',
      'business',
      'admin_role',
      'service_category',
      'service_subcategory',
      'service_addon',
      'provider_note',
      'system',
      'user',
      'admin_actions',
      'breach',
      'provider_application',
      'provider_document',
      'service_area_change_request',
      -- BUG-PHASE19-02 new entries
      'admin_staff',
      'notification_template',
      'pricing_rule',
      'promotion',
      'service_area',
      'support_ticket'
    ));

  RAISE NOTICE 'Migration 119 applied: admin_actions CHECK widened with 40 missing verbs (35 action_type + 6 target_type).';
END
$migration_119$;
