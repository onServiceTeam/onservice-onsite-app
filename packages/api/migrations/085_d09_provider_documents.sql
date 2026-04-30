-- Phase 14 Dispatch 09 — Bugs 1193, 1194/1195 (manual review path).
-- Provider documents replaces legacy URL-in-JSONB approach.
--
-- Key fix: NBI clearance + ID + proof-of-address + selfie all upload via
-- multipart to the existing upload service (S3 + KMS). DB row stores the
-- s3_key + status; admin reviewer transitions status to approved/rejected.
--
-- Selfie liveness is captured + stored same as other docs but no
-- automated verification runs in v1.0 — admin reviews it visually as
-- part of the Provider Review queue. v1.1+ wires Onfido / Persona.

BEGIN;

CREATE TABLE provider_documents (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_kind TEXT NOT NULL CHECK (document_kind IN (
        'nbi_clearance',
        'government_id_front',
        'government_id_back',
        'proof_of_address',
        'professional_certification',
        'business_permit',
        'tax_certificate',
        'selfie_liveness'
    )),
    s3_key TEXT NOT NULL,
    s3_bucket TEXT,
    storage_url TEXT,
    thumbnail_s3_key TEXT,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    page_number INTEGER,
    status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN (
        'uploaded', 'pending_review', 'approved', 'rejected', 'expired', 'replaced'
    )),
    expires_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    replaced_by UUID REFERENCES provider_documents(id) ON DELETE SET NULL
);

CREATE INDEX idx_provider_documents_user_kind
    ON provider_documents(user_id, document_kind, status);

CREATE INDEX idx_provider_documents_pending_review
    ON provider_documents(uploaded_at)
    WHERE status = 'pending_review';

CREATE INDEX idx_provider_documents_expiring
    ON provider_documents(expires_at)
    WHERE expires_at IS NOT NULL AND status = 'approved';

-- New admin_actions verbs for D09 reviewer actions.
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
        -- D09 additions
        'provider_application_submitted',
        'provider_application_sent_back',
        'provider_application_approved',
        'provider_application_rejected',
        'provider_document_approved',
        'provider_document_rejected',
        'service_area_change_approved',
        'service_area_change_rejected'
    ));

ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS admin_actions_target_type_check;
ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_target_type_check
    CHECK (target_type IN (
        'provider', 'customer', 'booking', 'dispute', 'payout', 'config',
        'official_receipt', 'bir_2307_batch', 'vat_report', 'reconciliation',
        'dsr_request', 'consent_version', 'message',
        'business', 'admin_role', 'service_category', 'service_subcategory',
        'service_addon', 'provider_note',
        'system', 'user', 'admin_actions', 'breach',
        -- D09 additions
        'provider_application',
        'provider_document',
        'service_area_change_request'
    ));

COMMIT;
