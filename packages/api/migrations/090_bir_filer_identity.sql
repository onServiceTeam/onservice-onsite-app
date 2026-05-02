-- CRIT-N03 + CRIT-N06 fix — BIR filer identity from platform_settings.
--
-- Pre-fix: or.service, bir-2307.service, and vat-report.service all
-- generated PDFs with hardcoded placeholder values:
--   TIN: 000-000-000-000
--   Address: [Placeholder] Makati City, Metro Manila, Philippines
--   BIR PTU: [Placeholder]
-- Launch-blocking BIR compliance: the accountant cannot file from a
-- placeholder PDF; the monthly batch produces invalid filings if not
-- human-reviewed.
--
-- Post-fix: BIR filer identity is read from platform_settings at PDF
-- generation time. Admin Settings UI (already gated to super_admin per
-- CRIT-N16 fix) is the operator's surface to set these once before
-- launch.
--
-- All keys default to the documented sentinel string
-- '__UNSET__' so a startup-time check (recommended in audit closeout)
-- can detect unset values and refuse to issue a real OR/2307/VAT PDF.

INSERT INTO platform_settings (
  category, subcategory, key, label, description,
  value_type, value, default_value,
  display_order, is_active, requires_restart
)
VALUES
  (
    'bir', 'filer_identity',
    'bir_filer_company_name',
    'BIR Filer Company Name',
    'Legal company name on BIR Form 2550M, OR PDFs, and BIR Form 2307. Must match the BIR Certificate of Registration. Required before issuing any BIR-bound PDF.',
    'string', '__UNSET__', '__UNSET__',
    200, TRUE, FALSE
  ),
  (
    'bir', 'filer_identity',
    'bir_filer_tin',
    'BIR Filer TIN',
    'Tax Identification Number (TIN) on BIR Certificate of Registration. Format NNN-NNN-NNN-NNN. Required before issuing any BIR-bound PDF.',
    'string', '__UNSET__', '__UNSET__',
    201, TRUE, FALSE
  ),
  (
    'bir', 'filer_identity',
    'bir_filer_address',
    'BIR Filer Registered Address',
    'Registered business address on BIR Certificate of Registration. Required before issuing any BIR-bound PDF.',
    'string', '__UNSET__', '__UNSET__',
    202, TRUE, FALSE
  ),
  (
    'bir', 'filer_identity',
    'bir_filer_ptu_number',
    'BIR Permit to Use (PTU) Number',
    'BIR-issued PTU for Computerized Accounting System (CAS) or Loose Leaf Books. Format BIR-PTU-NNNNNN. Required on Official Receipt PDFs per BIR Form 1907 procedure.',
    'string', '__UNSET__', '__UNSET__',
    203, TRUE, FALSE
  ),
  (
    'bir', 'filer_identity',
    'bir_filer_vat_status',
    'BIR Filer VAT Registration Status',
    'Either VAT-Registered or Non-VAT. Affects VAT report generation and OR layout.',
    'string', 'VAT-Registered', 'VAT-Registered',
    204, TRUE, FALSE
  )
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN platform_settings.key IS
  'BIR filer identity keys (bir_filer_*) added by migration 090 (CRIT-N03+N06). Operator MUST set non-__UNSET__ values via the admin Settings UI before launch — services refuse to generate BIR-bound PDFs while any value is __UNSET__.';
