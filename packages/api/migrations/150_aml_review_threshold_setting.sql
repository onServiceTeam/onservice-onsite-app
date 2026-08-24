-- Migration 150: expose the internal large-payout review threshold in the
-- audited admin settings registry. Migration 091 added payout columns but did
-- not seed this row, so production silently used the in-code fallback and the
-- documented control was not actually tunable or visible to operators.
--
-- This is an internal review control, not a legal determination that onService
-- is a covered person or that a payout is a reportable AMLA transaction. The
-- maximum is the conservative launch default (₱500,000); operators may make
-- the hold stricter but cannot raise it to bypass review.

INSERT INTO platform_settings
  (category, key, label, description, value_type, value, default_value,
   min_value, max_value, unit, display_order)
VALUES (
  'compliance',
  'aml_large_transaction_threshold_centavos',
  'Large Payout Review Threshold',
  'Internal payout amount at or above which a request is held for reasoned super-admin review. This control does not itself classify or report a transaction under AMLA.',
  'currency',
  '50000000',
  '50000000',
  10000,
  50000000,
  'centavos',
  10
)
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  value_type = EXCLUDED.value_type,
  default_value = EXCLUDED.default_value,
  min_value = EXCLUDED.min_value,
  max_value = EXCLUDED.max_value,
  unit = EXCLUDED.unit,
  display_order = EXCLUDED.display_order;
