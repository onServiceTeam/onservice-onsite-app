-- Phase 14 Dispatch 07 — Bugs 36, 37, 461, 1224, 73, 943, 944.
-- Per-booking photo + signature evidence storage.
--
-- Photos and signatures live in S3 (via existing upload.service.ts which
-- supports both AWS S3 and local-FS dual mode). This migration adds the
-- DB rows that link booking_id → S3 storage_key/storage_url.
--
-- Cross-FK fix: migration 078 declared booking_checklist_items.photo_id
-- without adding the FK constraint (because booking_photos didn't exist
-- yet). This migration adds the FK as a follow-up ALTER.

BEGIN;

-- ────────────────────────────────────────────────────────────────────
-- (1) booking_photos — provider + customer photo evidence
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE booking_photos (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    uploaded_by_role TEXT NOT NULL CHECK (uploaded_by_role IN ('customer', 'provider', 'admin')),
    photo_type TEXT NOT NULL CHECK (photo_type IN (
        'before',     -- Provider's pre-service photo
        'during',     -- Mid-job in-progress shot
        'after',      -- Post-service evidence (Bug 1220 requires ≥2 of these)
        'issue',      -- Provider/customer flagging a problem
        'checklist',  -- Linked to a checklist item (Bug 461)
        'identity',   -- Provider IC / KYC artifact
        'portfolio'   -- Provider profile portfolio
    )),
    -- S3 storage details (or local FS path in dev mode)
    storage_key TEXT NOT NULL,    -- e.g., 'bookings/<id>/photos/<id>.jpg'
    storage_url TEXT,             -- pre-signed or public URL; resolvable by upload.service
    thumbnail_key TEXT,           -- optional thumbnail (v1.1 may populate)
    -- Capture metadata
    original_size_bytes INTEGER,
    stored_size_bytes INTEGER,
    mime_type TEXT NOT NULL,
    -- Soft delete for retention policy + admin moderation
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    deleted_reason TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_booking_photos_booking_type
    ON booking_photos(booking_id, photo_type)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_booking_photos_uploader
    ON booking_photos(uploaded_by, uploaded_at DESC)
    WHERE deleted_at IS NULL;

-- ────────────────────────────────────────────────────────────────────
-- (2) booking_checklist_items.photo_id FK (deferred from migration 078)
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE booking_checklist_items
    ADD CONSTRAINT booking_checklist_items_photo_fk
    FOREIGN KEY (photo_id) REFERENCES booking_photos(id) ON DELETE SET NULL;

-- ────────────────────────────────────────────────────────────────────
-- (3) booking_signatures — provider IC + customer acceptance variants
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE booking_signatures (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
    -- Provider IC agreement signatures aren't tied to a specific booking;
    -- they're tied to the provider's onboarding. signed_by + signed_role
    -- carries the actor identity.
    signed_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    signed_role TEXT NOT NULL CHECK (signed_role IN ('customer', 'provider', 'admin')),
    signature_type TEXT NOT NULL CHECK (signature_type IN (
        'ic_agreement',       -- Provider IC onboarding (Bug 37)
        'customer_acceptance', -- Customer accepts completed work
        'work_authorization', -- Customer pre-authorizes work scope
        'change_order_accept' -- Customer accepts a change order
    )),
    storage_key TEXT NOT NULL,    -- S3 key for the PNG bitmap
    storage_url TEXT,
    -- Provider IC signatures store the typed name alongside the bitmap
    -- so the audit trail shows BOTH (typed disambiguates illegible scrawl).
    full_name_typed TEXT,
    -- Capture context
    signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    deleted_reason TEXT
);

CREATE INDEX idx_booking_signatures_booking
    ON booking_signatures(booking_id, signature_type)
    WHERE booking_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_booking_signatures_signer
    ON booking_signatures(signed_by, signed_at DESC)
    WHERE deleted_at IS NULL;

-- The ic_agreement signature is unique per provider — they sign once
-- during onboarding, no re-signature unless the legal text changes
-- (a new IC agreement creates a new row).
CREATE UNIQUE INDEX idx_booking_signatures_ic_per_provider
    ON booking_signatures(signed_by)
    WHERE signature_type = 'ic_agreement' AND deleted_at IS NULL;

COMMIT;
