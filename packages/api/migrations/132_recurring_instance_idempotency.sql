-- Recurring auto-charge idempotency (audit 2026-06-04).
--
-- A recurring series should produce exactly ONE instance (one occurrence) per
-- scheduled_date. Without a uniqueness key, a concurrent/retried scheduler run
-- could create two bookings + two charges for one cycle. Today the scheduler
-- Worker is concurrency:1 with no retries on a single server, so this can't
-- happen yet — but this key makes it safe before scaling to multiple workers,
-- and lets processRecurringBookings use the instance row as an idempotency gate
-- (INSERT ... ON CONFLICT DO NOTHING claims the cycle).
--
-- Dedup first (no-op on a clean DB) so the unique index can be created: per
-- (series, date) keep the most-complete row (one with a booking_id, else the
-- earliest), drop the rest.

DELETE FROM recurring_instances
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY recurring_booking_id, scheduled_date
      ORDER BY (booking_id IS NOT NULL) DESC, created_at ASC
    ) AS rn
    FROM recurring_instances
  ) ranked
  WHERE ranked.rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_recurring_instances_series_date
  ON recurring_instances (recurring_booking_id, scheduled_date);
