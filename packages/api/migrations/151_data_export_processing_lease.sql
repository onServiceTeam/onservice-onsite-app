-- Migration 151: make private data-export processing recoverable after a
-- worker/process interruption. The lease timestamp lets a later scheduler run
-- reclaim work without racing an export that is still actively being built.

ALTER TABLE data_export_requests
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

UPDATE data_export_requests
SET processing_started_at = created_at
WHERE status = 'processing' AND processing_started_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_data_export_processing_lease
  ON data_export_requests(processing_started_at)
  WHERE status = 'processing';
