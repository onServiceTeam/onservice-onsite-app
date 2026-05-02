-- Migration 103: extend admin_actions.action_type CHECK with
-- 'staff_added' to pair with 'staff_removed' (mig 100, MED-N128).
--
-- MED-N129 fix.
--
-- Pre-fix: staff.service.addStaffMember INSERTed into admin_staff with
-- no admin_actions audit row. Adding a staff member is privileged
-- (the new member can sign in to the admin panel from then on) and
-- needs forensic trail.
--
-- Post-fix: addStaffMember runs INSERT + admin_actions audit in a
-- single transaction. This migration extends the CHECK constraint to
-- accept 'staff_added'.

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
        'staff_removed',
        'staff_added'
    ));

COMMENT ON COLUMN admin_actions.action_type IS
    'Verb performed by an admin. staff_added (mig 103, MED-N129) for the audit trail when a super_admin adds a new staff member.';
