-- Phase 03: Rich platform_settings schema
-- Replaces the simple key/value table from migration 038 with a
-- categorized, validated, audit-aware settings table.

DROP TABLE IF EXISTS platform_settings_audit CASCADE;
DROP TABLE IF EXISTS platform_settings CASCADE;

CREATE TABLE platform_settings (
    id              UUID PRIMARY KEY DEFAULT uuidv7(),
    category        VARCHAR(50) NOT NULL,
    subcategory     VARCHAR(50),
    key             VARCHAR(100) NOT NULL UNIQUE,
    label           VARCHAR(200) NOT NULL,
    description     TEXT,
    value_type      VARCHAR(20) NOT NULL
                    CHECK (value_type IN ('number','percent','currency','integer','boolean','string','json')),
    value           TEXT NOT NULL,
    default_value   TEXT NOT NULL,
    min_value       DECIMAL(14,4),
    max_value       DECIMAL(14,4),
    allowed_values  TEXT[],
    display_order   INTEGER NOT NULL DEFAULT 0,
    unit            VARCHAR(20),
    is_sensitive    BOOLEAN NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    requires_restart BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by      UUID REFERENCES users(id),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_settings_category ON platform_settings(category, display_order);
CREATE INDEX idx_settings_key ON platform_settings(key);

-- ─── SEED ALL SETTINGS (corrected values per Phase 03 doc Step 3) ───

INSERT INTO platform_settings
  (category, key, label, description, value_type, value, default_value, min_value, max_value, unit, display_order)
VALUES
-- Commissions (corrected: founding 10, new 15, verified 13, pro 11, elite 9)
('commissions', 'commission_rate_founding','Founding Provider Rate','Commission rate for founding-batch providers','percent','10','10',1,50,'%',1),
('commissions', 'commission_rate_new',     'New Provider Rate',     'Commission rate for newly registered providers','percent','15','15',1,50,'%',2),
('commissions', 'commission_rate_verified','Verified Provider Rate','Commission rate for verified providers','percent','13','13',1,50,'%',3),
('commissions', 'commission_rate_pro',     'Pro Provider Rate',     'Commission rate for pro-tier providers','percent','11','11',1,50,'%',4),
('commissions', 'commission_rate_elite',   'Elite Provider Rate',   'Commission rate for elite-tier providers','percent','9','9',1,50,'%',5),

-- Fees
('fees', 'service_fee_rate',    'Service Fee Rate',    'Percentage of service price charged to customer','percent','10','10',1,25,'%',1),
('fees', 'service_fee_min',     'Minimum Service Fee', 'Minimum fee in centavos','currency','2500','2500',100,50000,'centavos',2),
('fees', 'service_fee_max',     'Maximum Service Fee', 'Maximum fee in centavos','currency','50000','50000',5000,500000,'centavos',3),
('fees', 'guarantee_fund_rate', 'Guarantee Fund Rate', 'Percent of service fee allocated to guarantee fund','percent','1.5','1.5',0.1,10,'%',4),
('fees', 'vat_rate',            'VAT Rate',            'Philippine VAT rate','percent','12','12',0,20,'%',5),

-- Escrow & payment
('escrow', 'escrow_auto_confirm_hours',   'Auto-Confirm Timer',    'Hours after completion before auto-confirm','integer','24','24',1,168,'hours',1),
('escrow', 'escrow_dispute_window_hours', 'Dispute Window',        'Hours customers can file a dispute','integer','48','48',12,168,'hours',2),
('escrow', 'minimum_payment_amount',      'Minimum Payment',       'Minimum booking payment in centavos','currency','10000','10000',10000,100000,'centavos',3),
('escrow', 'minimum_withdrawal_amount',   'Minimum Withdrawal',    'Minimum withdrawal in centavos','currency','10000','10000',5000,100000,'centavos',4),
('escrow', 'withdrawal_processing_days',  'Withdrawal Processing', 'Business days to process withdrawal','integer','3','3',1,14,'days',5),

-- Cancellation
('cancellation', 'cancel_refund_over_24h',         'Refund >24h Before',         'Customer refund % when cancelling >24h before','percent','100','100',0,100,'%',1),
('cancellation', 'cancel_refund_2_to_24h',         'Refund 2-24h Before',        'Customer refund % when cancelling 2-24h before','percent','100','100',0,100,'%',2),
('cancellation', 'cancel_refund_1_to_2h',          'Refund 1-2h Before',         'Customer refund % when cancelling 1-2h before','percent','90','90',0,100,'%',3),
('cancellation', 'cancel_refund_30min_to_1h',      'Refund 30min-1h Before',     'Customer refund % when cancelling 30m-1h before','percent','80','80',0,100,'%',4),
('cancellation', 'cancel_refund_under_30min',      'Refund <30min Before',       'Customer refund % when cancelling <30 min before','percent','70','70',0,100,'%',5),
('cancellation', 'cancel_refund_provider_arrived', 'Refund After Arrival',       'Customer refund % when provider already arrived','percent','50','50',0,100,'%',6),
('cancellation', 'cancel_refund_customer_noshow',  'Refund on Customer No-Show', 'Customer refund % on customer no-show','percent','0','0',0,100,'%',7),

-- SiguradoShield protection
('protection', 'max_property_damage_coverage','Max Property Damage', 'Maximum property damage coverage per incident (centavos)','currency','2500000','2500000',100000,10000000,'centavos',1),
('protection', 'max_theft_coverage',          'Max Theft Coverage',  'Maximum theft coverage per incident (centavos)','currency','1000000','1000000',100000,5000000,'centavos',2),
('protection', 'max_injury_coverage',         'Max Injury Coverage', 'Maximum injury reimbursement (centavos)','currency','5000000','5000000',100000,10000000,'centavos',3),
('protection', 'damage_deductible_threshold', 'Deductible Threshold','Claims above this trigger a deductible (centavos)','currency','500000','500000',0,2000000,'centavos',4),
('protection', 'damage_deductible_amount',    'Deductible Amount',   'Deductible amount (centavos)','currency','50000','50000',0,500000,'centavos',5),
('protection', 'claim_window_hours',          'Claim Window',        'Hours after service to file a claim','integer','48','48',24,168,'hours',6),
('protection', 'auto_suspend_claim_count',    'Auto-Suspend Claims', 'Valid claims in 30 days before auto-suspend','integer','3','3',1,10,'claims',7),
('protection', 'provider_recovery_rate',      'Provider Recovery %', 'Percent of claim recovered from provider','percent','100','100',0,100,'%',8),

-- Auth
('auth', 'otp_length',              'OTP Length',         'Number of digits in OTP codes','integer','6','6',4,8,'digits',1),
('auth', 'otp_expiry_minutes',      'OTP Expiry',         'Minutes before OTP expires','integer','5','5',1,30,'minutes',2),
('auth', 'otp_max_attempts',        'Max OTP Attempts',   'Verification attempts before lockout','integer','3','3',1,10,'attempts',3),
('auth', 'otp_cooldown_seconds',    'OTP Cooldown',       'Seconds between OTP resend requests','integer','60','60',30,300,'seconds',4),
('auth', 'jwt_access_expires',      'Access Token TTL',   'Access token expiration duration','string','15m','15m',NULL,NULL,NULL,5),
('auth', 'jwt_refresh_expires',     'Refresh Token TTL',  'Refresh token expiration duration','string','30d','30d',NULL,NULL,NULL,6),
('auth', 'admin_session_timeout_hours','Admin Session TTL','Admin session timeout in hours','integer','8','8',1,24,'hours',7),

-- Provider
('provider', 'provider_noshow_minutes', 'No-Show Timeout',     'Minutes after scheduled time before no-show','integer','30','30',10,120,'minutes',1),
('provider', 'nbi_expiry_warning_days', 'NBI Expiry Warning',  'Days before NBI expiry to warn','integer','30','30',7,90,'days',2),
('provider', 'max_service_radius_km',   'Max Service Radius',  'Maximum service radius','integer','50','50',5,100,'km',3),
('provider', 'quote_expiry_hours',      'Quote Expiry',        'Hours before submitted quote expires','integer','48','48',12,168,'hours',4),
('provider', 'max_quotes_per_booking',  'Max Quotes/Booking',  'Maximum quotes per job','integer','5','5',1,20,'quotes',5),

-- Security
('security', 'rate_limit_window_ms',    'Rate Limit Window',    'Rate limit time window (ms)','integer','900000','900000',60000,3600000,'ms',1),
('security', 'rate_limit_max_requests', 'Max Requests/Window',  'Max API requests per window','integer','100','100',10,1000,'requests',2),
('security', 'suspicious_ip_threshold', 'IP Block Threshold',   'Failed requests before blocking an IP','integer','10','10',5,500,'attempts',3),
('security', 'captcha_threshold',       'CAPTCHA Threshold',    'Failed OTPs before requiring CAPTCHA','integer','3','3',1,10,'attempts',4),

-- Cache TTLs (seconds)
('cache', 'cache_ttl_categories',       'Categories Cache',       'Cache duration for service categories','integer','86400','86400',60,604800,'seconds',1),
('cache', 'cache_ttl_provider_profile', 'Provider Profile Cache', 'Cache duration for provider profiles','integer','1800','1800',60,86400,'seconds',2),
('cache', 'cache_ttl_search_results',   'Search Results Cache',   'Cache duration for search results','integer','300','300',30,3600,'seconds',3)
ON CONFLICT (key) DO NOTHING;
