-- Migration: Add 'rejected' to providers status + admin_actions action_type
-- Required for admin provider rejection flow (Sprint 8)

-- 1. Allow 'rejected' as a valid provider status
ALTER TABLE providers DROP CONSTRAINT IF EXISTS providers_status_check;
ALTER TABLE providers ADD CONSTRAINT providers_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'suspended', 'deactivated'));

-- 2. Allow 'provider_rejected' as a valid admin action type
ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_type_check;
ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check
    CHECK (action_type IN (
        'provider_approved', 'provider_rejected', 'provider_suspended', 'provider_reactivated',
        'provider_tier_changed', 'provider_commission_adjusted', 'provider_banned',
        'customer_suspended', 'customer_reactivated', 'customer_credited',
        'booking_cancelled', 'dispute_assigned', 'dispute_resolved', 'dispute_escalated',
        'payout_approved', 'payout_rejected', 'config_changed', 'refund_issued'
    ));
