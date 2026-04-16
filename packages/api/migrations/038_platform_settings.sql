-- Platform settings: DB-backed key-value store for runtime configuration.
-- Admins can change commission rates, fees, timeouts without redeploying.

CREATE TABLE IF NOT EXISTS platform_settings (
  key         VARCHAR(100) PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_by  UUID REFERENCES users(id),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO platform_settings (key, value, description) VALUES
  ('commission_rate_new',       '0.20',       'Commission rate for new-tier providers'),
  ('commission_rate_verified',  '0.18',       'Commission rate for verified-tier providers'),
  ('commission_rate_pro',       '0.15',       'Commission rate for pro-tier providers'),
  ('commission_rate_elite',     '0.12',       'Commission rate for elite-tier providers'),
  ('service_fee_rate',          '0.05',       'Service fee rate charged to customers'),
  ('minimum_service_fee',       '2500',       'Minimum service fee in centavos'),
  ('maximum_service_fee',       '50000',      'Maximum service fee in centavos'),
  ('guarantee_fund_rate',       '0.015',      'Guarantee fund contribution rate'),
  ('escrow_auto_confirm_hours', '24',         'Hours before auto-confirming completed bookings'),
  ('vat_rate',                  '0.12',       'Philippine VAT rate'),
  ('min_withdrawal_amount',     '50000',      'Minimum withdrawal amount in centavos'),
  ('quote_expiry_hours',        '48',         'Hours before quotes auto-expire'),
  ('otp_expiry_minutes',        '5',          'OTP code expiry in minutes'),
  ('max_images_per_booking',    '10',         'Maximum images per booking'),
  ('provider_no_show_minutes',  '30',         'Minutes before flagging provider no-show'),
  ('suspicious_ip_threshold',   '10',         'Failed logins before auto-blocking IP'),
  ('admin_session_timeout_hrs', '8',          'Admin session timeout in hours'),
  ('default_service_area_km',   '25',         'Default service area radius in km'),
  ('max_service_radius_km',     '50',         'Maximum service radius in km')
ON CONFLICT (key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_platform_settings_updated ON platform_settings (updated_at DESC);
