-- Migration: Add 'manual_escrow_release' to admin_actions action_type
-- Required for admin manual escrow release (e.g., free_redo dispute resolution)

ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_type_check;
ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check
    CHECK (action_type IN (
        'provider_approved', 'provider_rejected', 'provider_suspended', 'provider_reactivated',
        'provider_tier_changed', 'provider_commission_adjusted', 'provider_banned',
        'customer_suspended', 'customer_reactivated', 'customer_credited',
        'booking_cancelled', 'dispute_assigned', 'dispute_resolved', 'dispute_escalated',
        'payout_approved', 'payout_rejected', 'config_changed', 'refund_issued',
        'manual_escrow_release'
    ));
