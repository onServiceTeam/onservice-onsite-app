// CRIT-N03 + CRIT-N06 fix — shared BIR filer identity loader.
//
// Pre-fix: or.service / bir-2307.service / vat-report.service each
// generated PDFs with hardcoded placeholder TIN/address/PTU values.
// Launch-blocking BIR compliance.
//
// Post-fix: read filer identity from platform_settings (migration 090)
// at PDF generation time. Refuse to generate a real PDF if any required
// field is still the sentinel '__UNSET__' — this fails closed so the
// platform can never accidentally ship a placeholder PDF to the BIR.
//
// Cached per-process for the request lifetime via the existing
// settings.service Redis layer; no separate cache here.

import { getSetting } from './settings.service';
import { createAppError } from '../middleware/error.middleware';

const UNSET_SENTINEL = '__UNSET__';

export interface BirFilerIdentity {
  companyName: string;
  tin: string;
  address: string;
  ptuNumber: string;
  vatStatus: string;
}

/**
 * Load the BIR filer identity from platform_settings. Throws 500 with a
 * specific error message if any required key is unset — this is a fail-
 * closed safeguard so an unconfigured launch can never issue a BIR PDF
 * with placeholder values.
 *
 * Allowed callers:
 * - or.service.issueOR (per-booking OR PDF)
 * - bir-2307.service (quarterly batches)
 * - vat-report.service (monthly Form 2550M)
 *
 * Operator workflow: set the values via the admin Settings UI under
 * the 'bir' category before launch. The Settings page is super_admin-
 * gated per CRIT-N16 fix.
 */
export async function getBirFilerIdentity(): Promise<BirFilerIdentity> {
  const [companyName, tin, address, ptuNumber, vatStatus] = await Promise.all([
    getSetting('bir_filer_company_name'),
    getSetting('bir_filer_tin'),
    getSetting('bir_filer_address'),
    getSetting('bir_filer_ptu_number'),
    getSetting('bir_filer_vat_status'),
  ]);

  const required: Array<[string, string]> = [
    ['bir_filer_company_name', companyName],
    ['bir_filer_tin', tin],
    ['bir_filer_address', address],
    ['bir_filer_ptu_number', ptuNumber],
  ];
  const unset = required.filter(([, v]) => v === UNSET_SENTINEL).map(([k]) => k);
  if (unset.length > 0) {
    throw createAppError(
      `BIR filer identity not configured. Set the following platform_settings keys via the admin Settings UI before generating BIR-bound PDFs: ${unset.join(', ')}.`,
      500,
    );
  }

  return { companyName, tin, address, ptuNumber, vatStatus };
}

/**
 * Test helper — does NOT throw on unset, returns the raw values. Used
 * by health checks that want to surface "BIR identity unconfigured" as
 * a warning without blocking PDF endpoints. Production code should call
 * `getBirFilerIdentity()` (the throwing variant).
 */
export async function getBirFilerIdentityRaw(): Promise<BirFilerIdentity> {
  const [companyName, tin, address, ptuNumber, vatStatus] = await Promise.all([
    getSetting('bir_filer_company_name'),
    getSetting('bir_filer_tin'),
    getSetting('bir_filer_address'),
    getSetting('bir_filer_ptu_number'),
    getSetting('bir_filer_vat_status'),
  ]);
  return { companyName, tin, address, ptuNumber, vatStatus };
}

export const BIR_FILER_UNSET_SENTINEL = UNSET_SENTINEL;
