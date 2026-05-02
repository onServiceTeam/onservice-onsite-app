-- Migration 096: Distinguish 'flag_fraud' admin action from
-- 'customer_suspended' in admin_actions, AND add a queryable
-- is_flagged_fraud boolean to users.
--
-- MED-N15 fix.
--
-- Pre-fix: customer-admin.service.flag_fraud branch wrote
-- admin_actions with action_type='customer_suspended' (because
-- 'flag_fraud' wasn't in the CHECK constraint) plus a '[fraud_flag] '
-- prefix in the reason. Analytics that count suspensions vs flags
-- can't tell them apart without parsing reason strings. The same
-- problem in reverse: monthly suspension count is inflated by
-- fraud-flagged-but-still-active customers.
--
-- Post-fix:
--   1. Add 'customer_flagged_fraud' to the action_type CHECK
--      constraint so the service can record it correctly.
--   2. Add users.is_flagged_fraud BOOLEAN (default FALSE) so the
--      flag is queryable directly without parsing admin_actions.

ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_type_check;
ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check
    CHECK (action_type IN (
        'provider_approved', 'provider_rejected', 'provider_suspended', 'provider_reactivated',
        'provider_tier_changed', 'provider_commission_adjusted', 'provider_banned',
        'customer_suspended', 'customer_reactivated', 'customer_credited', 'customer_flagged_fraud',
        'booking_cancelled', 'booking_reassigned', 'booking_force_completed',
        'dispute_assigned', 'dispute_resolved', 'dispute_escalated',
        'dispute_message_sent', 'dispute_reopened',
        'payout_approved', 'payout_rejected', 'config_changed', 'refund_issued',
        'manual_escrow_release', 'aml_review_cleared',
        'or_issued', 'or_cancelled',
        'bir_2307_batch_generated', 'bir_2307_regenerated',
        'vat_report_generated', 'vat_report_finalized',
        'reconciliation_run', 'reconciliation_alert_acknowledged',
        'dsr_marked_complete', 'dsr_more_info_requested', 'dsr_rejected', 'dsr_escalated_to_npc',
        'consent_version_published', 'admin_message_sent',
        'provider_note_added', 'provider_note_deleted',
        'provider_profile_updated', 'provider_wallet_adjusted',
        'business_member_removed', 'business_ownership_transferred',
        'admin_role_archived',
        'service_category_created', 'service_category_updated',
        'service_subcategory_created', 'service_subcategory_updated',
        'service_addon_created', 'service_addon_updated', 'service_addon_deleted',
        'audit_log_exported', 'consent_search', 'pii_reveal',
        'breach_logged', 'breach_npc_notified', 'breach_status_changed',
        'dsr_action_dispatched',
        'provider_application_submitted', 'provider_application_sent_back',
        'provider_application_approved', 'provider_application_rejected',
        'provider_document_approved', 'provider_document_rejected',
        'service_area_change_approved', 'service_area_change_rejected',
        'admin_2fa_enrolled',
        'admin_2fa_disabled',
        'admin_backup_codes_generated',
        'admin_backup_codes_regenerated',
        'admin_backup_code_used'
    ));

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_flagged_fraud BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_flagged_fraud
    ON users(is_flagged_fraud, role)
    WHERE is_flagged_fraud = TRUE;

COMMENT ON COLUMN users.is_flagged_fraud IS
    'TRUE when admin used the flag_fraud action without suspending the user. Set by customer-admin.service.updateCustomerStatus(action=flag_fraud). MED-N15 fix.';
