-- Migration: Phase 07 — extend admin_actions.action_type for booking 360 + dispute detail
-- Adds: booking_reassigned, booking_force_completed, dispute_message_sent, dispute_reopened
-- Required for: admin reassign / force-complete / dispute message / dispute reopen flows
-- Sacred-file impact: NONE (constraint additive only; no data writes here)

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
        'manual_escrow_release'
    ));
