-- Phase 03: Audit trail for platform_settings changes.

CREATE TABLE platform_settings_audit (
    id            UUID PRIMARY KEY DEFAULT uuidv7(),
    setting_id    UUID NOT NULL REFERENCES platform_settings(id) ON DELETE CASCADE,
    setting_key   VARCHAR(100) NOT NULL,
    old_value     TEXT,
    new_value     TEXT NOT NULL,
    changed_by    UUID NOT NULL REFERENCES users(id),
    change_reason TEXT,
    ip_address    INET,
    user_agent    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_settings_audit_key ON platform_settings_audit(setting_key, created_at DESC);
CREATE INDEX idx_settings_audit_by  ON platform_settings_audit(changed_by, created_at DESC);
