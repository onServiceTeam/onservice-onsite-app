-- Phase 14 Dispatch 08 — Bug 1366.
-- Breach log + 72h NPC notification SLA.
--
-- NPC RA 10173 §38 requires data controllers to notify the NPC within
-- 72 hours of becoming aware of a personal data breach. Pre-D08 the
-- admin Compliance page had a Breach Log tab placeholder but no table,
-- no timer, no escalation. This migration creates the durable record;
-- the cron job (jobs/breach-sla-checker.ts) handles approaching/expired
-- alerts; the admin endpoint (/admin/breach-log) returns enriched rows
-- with sla72h_expired + sla72h_remaining_hours computed in app.

BEGIN;

CREATE TABLE breach_log (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    type TEXT NOT NULL CHECK (type IN (
        'unauthorized_access',
        'data_loss',
        'data_exposure',
        'system_compromise',
        'other'
    )),
    scope TEXT NOT NULL,                       -- description of affected data
    affected_user_count INTEGER,
    occurred_at TIMESTAMPTZ NOT NULL,
    discovered_at TIMESTAMPTZ NOT NULL,
    npc_notified_at TIMESTAMPTZ,
    npc_reference TEXT,                        -- exact reference issued by NPC
    status TEXT NOT NULL CHECK (status IN (
        'investigating', 'mitigating', 'reported', 'closed'
    )),
    reported_by UUID REFERENCES users(id) ON DELETE SET NULL,
    remediation_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Discovery cannot precede the breach occurrence.
    CHECK (discovered_at >= occurred_at),
    -- npc_reference must be populated when notified.
    CHECK ((npc_notified_at IS NULL) OR (npc_reference IS NOT NULL))
);

-- Pending-NPC partial index drives the cron job's hot loop and the
-- admin Compliance page's "needs attention" view.
CREATE INDEX idx_breach_pending_npc
    ON breach_log(discovered_at)
    WHERE npc_notified_at IS NULL;

CREATE INDEX idx_breach_status_recent
    ON breach_log(status, discovered_at DESC);

-- Audit verbs for D08:
ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_type_check;
ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check
    CHECK (action_type IN (
        -- pre-D08
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
        'provider_note_added', 'provider_note_deleted',
        'provider_profile_updated', 'provider_wallet_adjusted',
        'business_member_removed', 'business_ownership_transferred',
        'admin_role_archived',
        'service_category_created', 'service_category_updated',
        'service_subcategory_created', 'service_subcategory_updated',
        'service_addon_created', 'service_addon_updated', 'service_addon_deleted',
        -- D08 additions
        'audit_log_exported',     -- Bug 401 self-audit
        'consent_search',         -- Bug 402 search self-audit
        'pii_reveal',             -- Bug 81 super-admin PII reveal
        'breach_logged',          -- new breach entered
        'breach_npc_notified',    -- npc_notified_at populated
        'breach_status_changed',
        'dsr_action_dispatched'   -- Bug 153 unified dispatch
    ));

ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS admin_actions_target_type_check;
ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_target_type_check
    CHECK (target_type IN (
        'provider', 'customer', 'booking', 'dispute', 'payout', 'config',
        'official_receipt', 'bir_2307_batch', 'vat_report', 'reconciliation',
        'dsr_request', 'consent_version', 'message',
        'business', 'admin_role', 'service_category', 'service_subcategory',
        'service_addon', 'provider_note',
        -- D08 additions
        'system',                 -- audit log export targets system
        'user',                   -- consent search targets a user
        'admin_actions',          -- pii_reveal targets a prior action row
        'breach'                  -- breach_log entries
    ));

COMMIT;
