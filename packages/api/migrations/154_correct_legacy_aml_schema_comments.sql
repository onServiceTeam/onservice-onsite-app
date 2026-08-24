-- Migration 154: correct the legal overstatement left in migration 091's
-- schema comments. The status/column names remain for compatibility, but the
-- implemented control is an internal large-payout review hold. It does not by
-- itself determine that onService is an AMLA covered person, classify a payout
-- as a covered or suspicious transaction, or file a report.

COMMENT ON COLUMN payouts.requires_aml_review IS
  'Legacy field name. TRUE when a payout met the internal large-payout review threshold captured at request time. Requires reasoned super-admin review before ordinary payout approval. This flag is not a legal AMLA classification or report.';

COMMENT ON COLUMN payouts.aml_threshold_at_request_centavos IS
  'Snapshot of the internal large-payout review threshold at request time, in centavos. NULL for pre-091 rows. This value is an operational control, not a statutory reporting threshold determination.';
