-- Migration: Add suki_discount column to bookings for loyalty discount tracking
-- Stores the discount amount in centavos applied via suki tier membership

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS suki_discount INTEGER NOT NULL DEFAULT 0;
