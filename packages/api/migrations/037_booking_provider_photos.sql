-- Add before/after photo columns for provider job documentation
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_before_photos TEXT[] DEFAULT '{}';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS provider_after_photos TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_bookings_has_photos
  ON bookings (id)
  WHERE array_length(provider_before_photos, 1) > 0
     OR array_length(provider_after_photos, 1) > 0;
