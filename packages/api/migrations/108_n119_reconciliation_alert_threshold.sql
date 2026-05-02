-- 108_n119_reconciliation_alert_threshold.sql
--
-- MED-N119 fix — add admin-tunable platform_settings row for the
-- reconciliation alert threshold. The reconciliation.service still
-- exports ALERT_THRESHOLD_CENTAVOS as the in-code fallback, but
-- production tuning should come from this row (visible in admin
-- Settings UI, audit-trailed via platform_settings_audit).

-- CRIT-PHASE16-02f fix — original INSERT omitted category, label,
-- value_type, default_value (all NOT NULL since mig 050).
INSERT INTO platform_settings
  (category, key, label, description, value_type, value, default_value, min_value, max_value, unit, display_order)
  VALUES (
    'finance',
    'reconciliation_alert_threshold_centavos',
    'Reconciliation Alert Threshold',
    'Money-conservation reconciliation: |discrepancy| above this centavo amount triggers Slack + Sentry alerts and flags discrepancy_alert_sent on the snapshot. Default 10000 (₱100).',
    'currency',
    '10000',
    '10000',
    100,
    1000000,
    'centavos',
    100
  )
ON CONFLICT (key) DO NOTHING;
