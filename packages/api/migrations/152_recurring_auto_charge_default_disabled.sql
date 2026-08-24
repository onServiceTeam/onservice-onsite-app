-- Migration 152: recurring payment is manual-only while E20 remains open.
-- Migration 020 originally defaulted auto_charge to TRUE before a safe
-- token/consent/money path existed. Change the default for future rows without
-- mutating any existing recurring booking or payment evidence.

ALTER TABLE recurring_bookings
  ALTER COLUMN auto_charge SET DEFAULT FALSE;
