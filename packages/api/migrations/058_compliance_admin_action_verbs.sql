-- Phase 13 Dispatch C — extend admin_actions for compliance/DPO and admin messaging.
-- New verbs: DSR processing (4), consent version publishing (1), admin-to-customer messaging (1).
-- New target types: dsr_request, consent_version, message.

BEGIN;

ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_type_check;
ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check
    CHECK (action_type IN (
        -- pre-existing (migrations 001..054)
        'provider_approved', 'provider_rejected', 'provider_suspended', 'provider_reactivated',
        'provider_tier_changed', 'provider_commission_adjusted', 'provider_banned',
        'customer_suspended', 'customer_reactivated', 'customer_credited',
        'booking_cancelled', 'booking_reassigned', 'booking_force_completed',
        'dispute_assigned', 'dispute_resolved', 'dispute_escalated',
        'dispute_message_sent', 'dispute_reopened',
        'payout_approved', 'payout_rejected', 'config_changed', 'refund_issued',
        'manual_escrow_release',
        -- Phase 08 additions (migration 055)
        'or_issued', 'or_cancelled',
        'bir_2307_batch_generated', 'bir_2307_regenerated',
        'vat_report_generated', 'vat_report_finalized',
        'reconciliation_run', 'reconciliation_alert_acknowledged',
        -- Phase 13 Dispatch C additions
        'dsr_marked_complete', 'dsr_more_info_requested', 'dsr_rejected', 'dsr_escalated_to_npc',
        'consent_version_published',
        'admin_message_sent'
    ));

ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS admin_actions_target_type_check;
ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_target_type_check
    CHECK (target_type IN (
        'provider', 'customer', 'booking', 'dispute', 'payout', 'config',
        'official_receipt', 'bir_2307_batch', 'vat_report', 'reconciliation',
        -- Phase 13 Dispatch C additions
        'dsr_request', 'consent_version', 'message'
    ));

COMMIT;
