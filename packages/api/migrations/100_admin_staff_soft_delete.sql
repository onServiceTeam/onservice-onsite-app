-- Migration 100: admin_staff soft-delete columns + 'staff_removed'
-- admin_actions action_type.
--
-- MED-N128 fix.
--
-- Pre-fix: staff.service.removeStaffMember did a hard DELETE on
-- admin_staff with no audit trail. If the removal was malicious (an
-- attacker who got super_admin access removes legitimate staff to lock
-- them out of the admin panel), there's nothing to detect or recover.
-- The DELETE also left FK references in admin_actions and audit_log
-- pointing at a now-missing row.
--
-- Post-fix: removal is now a SOFT-DELETE — set is_active=FALSE,
-- removed_at=NOW(), removed_by=actor — so the row stays for forensics
-- and downstream FK references remain valid. An admin_actions row of
-- action_type='staff_removed' captures who removed whom.

ALTER TABLE admin_staff
    ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS removed_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_admin_staff_removed_at
    ON admin_staff(removed_at)
    WHERE removed_at IS NOT NULL;

COMMENT ON COLUMN admin_staff.removed_at IS
    'Soft-delete timestamp set by staff.service.removeStaffMember. NULL for active staff. MED-N128 fix.';
COMMENT ON COLUMN admin_staff.removed_by IS
    'users.id of the super_admin who soft-removed this staff member. ON DELETE SET NULL because the actor user could be deleted later (account deletion etc.) and we still want the historical row.';

-- Extend admin_actions.action_type CHECK with 'staff_removed'.
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
        'admin_backup_code_used',
        'staff_removed'
    ));

COMMENT ON COLUMN admin_actions.action_type IS
    'Verb performed by an admin. staff_removed added in mig 100 (MED-N128) for the soft-delete audit trail.';
