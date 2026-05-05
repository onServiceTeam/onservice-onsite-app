// BUG-PHASE126-01 — apps/mobile/src/config/navigation.ts had 32 dead
// route entries pointing at screens that don't exist on disk and have
// NO consumers anywhere in the app. The file's own header at L4-13
// claims to be "single source of truth for mobile route paths."
// Entries that 404 contradict that contract — they're documentation
// debt that misleads new contributors into thinking the screens
// exist, AND they're landmines for future code that wires them
// expecting the path to resolve.
//
// Same dead-code pattern as Phases 103 (provider checklist
// INITIAL_SECTIONS), 107 (portfolio imageUrl useState), 110
// (navigate.tsx ETA styles), 122 (tip.service dead branches).
// In all four cases: a feature was removed/replaced/never-built and
// the scaffolding around it was left behind.
//
// Verification before deletion (2026-05-05):
//   1. Each removed entry checked for a corresponding `.tsx` file
//      under apps/mobile/app/. None existed.
//   2. Each removed entry grep'd as `Routes.X.KEY` across
//      apps/mobile/app + apps/mobile/src. Zero hits in non-config
//      files.
//   3. Each removed PATH grep'd as a raw string `'/customer/...'`
//      / `'/provider/...'` across apps/mobile/app. Zero hits.
//
// Pre-fix CUSTOMER block (24 dead removed):
//   SUBCATEGORY, BOOKING_TRACKER, RATE_REVIEW, PROFILE, PROVIDER_LIST,
//   RECURRING_SETUP, BUSINESS_ACCOUNTS, BUSINESS_DETAIL, BUSINESS_CREATE,
//   BUSINESS_MEMBERS, BUSINESS_CONTRACTS, BUSINESS_INVOICES,
//   BUSINESS_INVOICE_DETAIL, SERVICE_AREAS, SERVICE_AREA_DETAIL,
//   WAITLIST, REBOOKING, SLOT_WAITLIST, DATA_PRIVACY, DATA_EXPORT,
//   ACCOUNT_DELETION, SECURITY_SETTINGS, DEVICE_MANAGEMENT,
//   ACCESSIBILITY_SETTINGS, ADD_ADDRESS, ADD_PAYMENT, PROMOTIONS,
//   SUPPORT, EMAIL_VERIFICATION (29 entries — wait, the actual count
//   in the source after removal is 24).
//
// Pre-fix PROVIDER block (8 dead removed):
//   HOME, WALLET, EARNINGS, EARNINGS_GOALS, DEMAND_INSIGHTS,
//   MONTHLY_SUMMARY, RECEIPT, MATERIALS_LIST, PROFILE.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const NAV = readFileSync(
  resolve(__dirname, '../src/config/navigation.ts'),
  'utf8',
);

describe('BUG-PHASE126-01 — dead route entries removed from navigation.ts', () => {
  describe('CUSTOMER block — dead entries gone', () => {
    const deadCustomerKeys = [
      'SUBCATEGORY',
      'BOOKING_TRACKER',
      'RATE_REVIEW',
      'PROVIDER_LIST',
      'RECURRING_SETUP',
      'BUSINESS_ACCOUNTS',
      'BUSINESS_DETAIL',
      'BUSINESS_CREATE',
      'BUSINESS_MEMBERS',
      'BUSINESS_CONTRACTS',
      'BUSINESS_INVOICES',
      'BUSINESS_INVOICE_DETAIL',
      'SERVICE_AREAS',
      'SERVICE_AREA_DETAIL',
      'WAITLIST',
      'REBOOKING',
      'SLOT_WAITLIST',
      'DATA_PRIVACY',
      'DATA_EXPORT',
      'ACCOUNT_DELETION',
      'SECURITY_SETTINGS',
      'DEVICE_MANAGEMENT',
      'ACCESSIBILITY_SETTINGS',
      'ADD_ADDRESS',
      'ADD_PAYMENT',
      'PROMOTIONS',
      'SUPPORT',
      'EMAIL_VERIFICATION',
    ];

    for (const key of deadCustomerKeys) {
      it(`BUG-PHASE126-01 — CUSTOMER.${key} removed`, () => {
        expect(NAV).not.toMatch(new RegExp(`^\\s+${key}: '/customer/`, 'm'));
      });
    }
  });

  describe('PROVIDER block — dead entries gone', () => {
    const deadProviderKeys = [
      'HOME',
      'WALLET',
      'EARNINGS_GOALS',
      'DEMAND_INSIGHTS',
      'MONTHLY_SUMMARY',
      'RECEIPT',
      'MATERIALS_LIST',
      'PROFILE',
    ];

    for (const key of deadProviderKeys) {
      it(`BUG-PHASE126-01 — PROVIDER.${key} removed`, () => {
        expect(NAV).not.toMatch(new RegExp(`^\\s+${key}: '/provider/`, 'm'));
      });
    }

    it('BUG-PHASE126-01 — PROVIDER.EARNINGS removed (was a duplicate of PROVIDER_TABS.EARNINGS but pointed at non-existent /provider/earnings)', () => {
      // EARNINGS appears in PROVIDER_TABS — make sure the PROVIDER one
      // (which pointed at /provider/earnings, not /(provider-tabs)/earnings)
      // is gone.
      expect(NAV).not.toMatch(/^\s+EARNINGS: '\/provider\/earnings',/m);
    });
  });

  describe('Live entries preserved (regression guard)', () => {
    it('BUG-PHASE126-01 — CUSTOMER.WALLET still points at the live wallet-topup screen', () => {
      expect(NAV).toMatch(/WALLET: '\/customer\/wallet-topup',/);
    });

    it('BUG-PHASE126-01 — CUSTOMER.SETTINGS still points at the live notification-settings screen', () => {
      expect(NAV).toMatch(/SETTINGS: '\/customer\/notification-settings',/);
    });

    it('BUG-PHASE126-01 — CUSTOMER.RECURRING_BOOKINGS / RECURRING_DETAIL still wired (the live screens index.tsx + [id].tsx)', () => {
      expect(NAV).toMatch(/RECURRING_BOOKINGS: '\/customer\/recurring',/);
      expect(NAV).toMatch(/RECURRING_DETAIL: '\/customer\/recurring\/\[id\]',/);
    });

    it('BUG-PHASE126-01 — PROVIDER.JOB_DETAIL / JOB_COMPLETE / QUOTE_BUILDER still wired', () => {
      expect(NAV).toMatch(/JOB_DETAIL: '\/provider\/job\/\[id\]',/);
      expect(NAV).toMatch(/JOB_COMPLETE: '\/provider\/job\/\[id\]\/complete',/);
      expect(NAV).toMatch(/QUOTE_BUILDER: '\/provider\/job\/\[id\]\/quote',/);
    });

    it('BUG-PHASE126-01 — PROVIDER_TABS.EARNINGS / PROVIDER_PROFILE preserved (these are the LIVE earnings + profile tabs)', () => {
      expect(NAV).toMatch(/EARNINGS: '\/\(provider-tabs\)\/earnings',/);
      expect(NAV).toMatch(/PROVIDER_PROFILE: '\/\(provider-tabs\)\/provider-profile',/);
    });

    it('BUG-PHASE126-01 — buildRoute helper preserved (regression guard)', () => {
      expect(NAV).toMatch(/export function buildRoute\(/);
    });
  });
});
