-- Phase 14 Dispatch 10 — Bug 360.
-- Admin TOTP backup codes (8 single-use bcrypt-hashed codes per admin).
-- Generated at 2FA enrollment time; consumed when admin loses authenticator.
-- Once consumed, the row is marked used_at and cannot be reused.

BEGIN;

CREATE TABLE admin_backup_codes (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,             -- bcrypt-hashed 10-char alphanumeric code
    used_at TIMESTAMPTZ,
    used_ip INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Deletion is operator-driven (regenerate set after compromise);
    -- soft delete tracks the regeneration event.
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_admin_backup_codes_user
    ON admin_backup_codes(admin_user_id, used_at, deleted_at);

CREATE INDEX idx_admin_backup_codes_active
    ON admin_backup_codes(admin_user_id)
    WHERE used_at IS NULL AND deleted_at IS NULL;

-- New admin_actions verbs for D10 backup code lifecycle.
ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_type_check;
ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check
    CHECK (action_type IN (
        'provider_approved', 'provider_rejected', 'provider_suspended', 'provider_reactivated',
        'provider_tier_changed', 'provider_commission_adjusted', 'provider_banned',
        'customer_suspended', 'customer_reactivated', 'customer_credited',
        'booking_cancelled', 'booking_reassigned', 'booking_force_completed',
        'dispute_assigned', 'dispute_resolved', 'dispute_escalated',
        'dispute_message_sent', 'dispute_reopened',
        'payout_approved', 'payout_rejected', 'config_changed', 'refund_issued',
        'manual_escrow_release',
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
        -- D10 additions
        'admin_2fa_enrolled',
        'admin_2fa_disabled',
        'admin_backup_codes_generated',
        'admin_backup_codes_regenerated',
        'admin_backup_code_used'
    ));

COMMIT;
