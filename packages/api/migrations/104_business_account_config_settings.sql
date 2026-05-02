-- Migration 104: Admin-tunable business account types + payment terms.
-- MED-N165 fix.
--
-- Pre-fix: business.routes.ts hardcoded the validTypes array
-- ['office', 'condo_management', ..., 'other'] and the validPaymentTerms
-- array ['net_15', 'net_30', 'net_60'] inline. Adding a new business
-- type or payment term required a code deploy.
--
-- Post-fix: both lists are platform_settings rows. The handler reads
-- them via settingsService.getSettingArray and validates accordingly.
-- Admin can grow the lists from the Settings UI without engineering.

INSERT INTO platform_settings (
    category, subcategory, key, label, description,
    value_type, value, default_value,
    display_order, is_active
)
VALUES
    (
        'catalog', 'business',
        'business_account_types',
        'Allowed business account types',
        'Comma-separated list of allowed business_type values for POST /business-accounts. Customer-facing label is rendered client-side per type. MED-N165.',
        'string',
        'office,condo_management,restaurant,hotel,retail,school,hospital,other',
        'office,condo_management,restaurant,hotel,retail,school,hospital,other',
        300, TRUE
    ),
    (
        'catalog', 'business',
        'business_payment_terms',
        'Allowed business payment terms',
        'Comma-separated list of allowed payment_terms values for business accounts. NET-N format where N is the days-to-pay. MED-N165.',
        'string',
        'net_15,net_30,net_60',
        'net_15,net_30,net_60',
        301, TRUE
    )
ON CONFLICT (key) DO NOTHING;
