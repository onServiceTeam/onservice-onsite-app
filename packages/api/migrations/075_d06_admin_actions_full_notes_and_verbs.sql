-- Phase 14 Dispatch 06 — Bug 85 + transactional audit completeness verbs.
--
-- (1) Add admin_actions.full_notes column (Bug 85).
--     The existing `reason` column is treated as a 500-char-truncated
--     summary by every caller; the full body of admin↔user dispute
--     messages must be preserved verbatim for compliance audit. Migration
--     adds nullable `full_notes TEXT` so existing rows are backwards-
--     compatible (NULL means "not captured before D06"), and D06's
--     dispute.service.sendDisputeMessage stores the full message there.
--
-- (2) Extend admin_actions.action_type CHECK constraint with all new
--     audit verbs introduced by D06's transactional fixes:
--       - provider_note_added            (Bug 82)
--       - provider_note_deleted          (Bug 80, soft-delete-flagged)
--       - provider_profile_updated       (Bug 79)
--       - provider_wallet_adjusted       (Bug 78)
--       - business_member_removed        (Bug 105)
--       - business_ownership_transferred (Bug 106)
--       - admin_role_archived            (Bug 127)
--       - service_category_created       (Bug 237)
--       - service_category_updated       (Bug 237)
--       - service_subcategory_created    (Bug 237)
--       - service_subcategory_updated    (Bug 237)
--       - service_addon_created          (Bug 237)
--       - service_addon_updated          (Bug 237)
--       - service_addon_deleted          (Bug 237)
--
--     Plus extend target_type with: business, admin_role, service_category,
--     service_subcategory, service_addon, provider_note. (Pre-existing
--     verbs/types from migrations 014/055/058 are preserved verbatim — the
--     constraint is dropped and re-added with the union.)
--
-- (3) Index on (admin_id, created_at DESC) — the admin-audit listing page
--     filters by admin_id ordered chronologically. Existing
--     idx_admin_actions_admin (created in 014) does not include
--     created_at; adding the composite index keeps listing fast as the
--     audit table grows.

BEGIN;

-- (1) full_notes column — nullable for backwards compat with rows
--     written before this migration ran.
ALTER TABLE admin_actions
    ADD COLUMN IF NOT EXISTS full_notes TEXT;

-- (2) Extend action_type CHECK constraint.
ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_type_check;
ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check
    CHECK (action_type IN (
        -- pre-existing (migrations 014, 055, 058)
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
        'consent_version_published',
        'admin_message_sent',
        -- Phase 14 Dispatch 06 additions
        'provider_note_added',
        'provider_note_deleted',
        'provider_profile_updated',
        'provider_wallet_adjusted',
        'business_member_removed',
        'business_ownership_transferred',
        'admin_role_archived',
        'service_category_created',
        'service_category_updated',
        'service_subcategory_created',
        'service_subcategory_updated',
        'service_addon_created',
        'service_addon_updated',
        'service_addon_deleted'
    ));

-- (2 cont'd) Extend target_type CHECK constraint.
ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS admin_actions_target_type_check;
ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_target_type_check
    CHECK (target_type IN (
        'provider', 'customer', 'booking', 'dispute', 'payout', 'config',
        'official_receipt', 'bir_2307_batch', 'vat_report', 'reconciliation',
        'dsr_request', 'consent_version', 'message',
        -- Phase 14 Dispatch 06 additions
        'business',
        'admin_role',
        'service_category',
        'service_subcategory',
        'service_addon',
        'provider_note'
    ));

-- (3) Composite index for admin-audit listing.
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_created
    ON admin_actions(admin_id, created_at DESC);

COMMIT;
