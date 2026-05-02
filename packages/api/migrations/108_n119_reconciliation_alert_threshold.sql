-- 108_n119_reconciliation_alert_threshold.sql
--
-- MED-N119 fix — add admin-tunable platform_settings row for the
-- reconciliation alert threshold. The reconciliation.service still
-- exports ALERT_THRESHOLD_CENTAVOS as the in-code fallback, but
-- production tuning should come from this row (visible in admin
-- Settings UI, audit-trailed via platform_settings_audit).

INSERT INTO platform_settings (key, value, description)
  VALUES (
    'reconciliation_alert_threshold_centavos',
    '10000',
    'Money-conservation reconciliation: |discrepancy| above this centavo amount triggers Slack + Sentry alerts and flags discrepancy_alert_sent on the snapshot. Default 10000 (₱100).'
  )
ON CONFLICT (key) DO NOTHING;
