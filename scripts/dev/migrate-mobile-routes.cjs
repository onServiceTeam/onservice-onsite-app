#!/usr/bin/env node
// scripts/dev/migrate-mobile-routes.cjs
//
// Bug 1185 migration helper. One-time codemod that walks
// apps/mobile/{app,src}/**/*.{ts,tsx} and converts
//
//   router.push('/customer/wallet')      -> router.push(Routes.CUSTOMER.WALLET)
//   router.replace('/(tabs)/home')        -> router.replace(Routes.TABS.HOME)
//
// Adds `import { Routes } from '@/config/navigation';` to each file that
// gains a Routes reference and didn't already import it.
//
// Idempotent — running twice is a no-op. Doesn't touch backtick template
// paths; those carry params and need case-by-case buildRoute() decisions.

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');

const MAP = new Map([
  ['/(tabs)/home',                                 'Routes.TABS.HOME'],
  ['/(tabs)/bookings',                             'Routes.TABS.BOOKINGS'],
  ['/(tabs)/profile',                              'Routes.TABS.PROFILE'],
  ['/(tabs)/wallet',                               'Routes.TABS.WALLET'],
  ['/(provider-tabs)',                             'Routes.PROVIDER_TABS.DASHBOARD'],
  ['/(provider-tabs)/dashboard',                   'Routes.PROVIDER_TABS.DASHBOARD'],
  ['/(provider-tabs)/jobs',                        'Routes.PROVIDER_TABS.JOBS'],
  ['/(provider-tabs)/earnings',                    'Routes.PROVIDER_TABS.EARNINGS'],
  ['/auth/login',                                  'Routes.AUTH.LOGIN'],
  ['/onboarding',                                  'Routes.AUTH.ONBOARDING'],
  ['/customer/account-management',                 'Routes.CUSTOMER.ACCOUNT_MANAGEMENT'],
  ['/customer/address-picker',                     'Routes.CUSTOMER.ADDRESS_PICKER'],
  ['/customer/addresses',                          'Routes.CUSTOMER.ADDRESSES'],
  ['/customer/booking/checkout',                   'Routes.CUSTOMER.CHECKOUT'],
  ['/customer/booking/configure',                  'Routes.CUSTOMER.BOOKING_CONFIGURE'],
  ['/customer/booking/form',                       'Routes.CUSTOMER.BOOKING_FORM'],
  ['/customer/booking/job-request',                'Routes.CUSTOMER.BOOKING_JOB_REQUEST'],
  ['/customer/help',                               'Routes.CUSTOMER.HELP'],
  ['/customer/notification-settings',              'Routes.CUSTOMER.SETTINGS'], // closest existing
  ['/customer/notifications',                      'Routes.CUSTOMER.NOTIFICATIONS'],
  ['/customer/payment-methods',                    'Routes.CUSTOMER.PAYMENT_METHODS'],
  ['/customer/recurring',                          'Routes.CUSTOMER.RECURRING_BOOKINGS'],
  ['/customer/safety',                             'Routes.CUSTOMER.SAFETY'],
  ['/customer/search',                             'Routes.CUSTOMER.SEARCH'],
  ['/customer/suki-pros',                          'Routes.CUSTOMER.SUKI_PROS'],
  ['/customer/terms',                              'Routes.CUSTOMER.TERMS'],
  ['/customer/wallet-topup',                       'Routes.CUSTOMER.WALLET'], // wallet topup is part of wallet
  ['/provider-onboarding/background-check-status', 'Routes.PROVIDER_ONBOARDING.BACKGROUND_CHECK_STATUS'],
  ['/provider-onboarding/categories',              'Routes.PROVIDER_ONBOARDING.CATEGORIES'],
  ['/provider-onboarding/documents',               'Routes.PROVIDER_ONBOARDING.DOCUMENTS'],
  ['/provider-onboarding/review-pending',          'Routes.PROVIDER_ONBOARDING.REVIEW_PENDING'],
  ['/provider-onboarding/role-select',             'Routes.PROVIDER_ONBOARDING.ROLE_SELECT'],
  ['/provider-onboarding/selfie',                  'Routes.PROVIDER_ONBOARDING.SELFIE'],
  ['/provider-onboarding/service-area',            'Routes.PROVIDER_ONBOARDING.SERVICE_AREA'],
  ['/provider-onboarding/terms',                   'Routes.PROVIDER_ONBOARDING.TERMS'],
  ['/provider/account-management',                 'Routes.PROVIDER.ACCOUNT_MANAGEMENT'],
  ['/provider/availability',                       'Routes.PROVIDER.AVAILABILITY'],
  ['/provider/calendar',                           'Routes.PROVIDER.CALENDAR'],
  ['/provider/certifications',                     'Routes.PROVIDER.CERTIFICATIONS'],
  ['/provider/help',                               'Routes.PROVIDER.HELP'],
  ['/provider/notifications',                      'Routes.PROVIDER.NOTIFICATIONS'],
  ['/provider/payout-settings',                    'Routes.PROVIDER.PAYOUT_SETTINGS'],
  ['/provider/payouts',                            'Routes.PROVIDER.PAYOUTS'],
  ['/provider/portfolio',                          'Routes.PROVIDER.PORTFOLIO'],
  ['/provider/reviews',                            'Routes.PROVIDER.REVIEWS'],
  ['/provider/schedule',                           'Routes.PROVIDER.SCHEDULE'],
  ['/provider/services',                           'Routes.PROVIDER.SERVICES'],
  ['/provider/settings',                           'Routes.PROVIDER.SETTINGS'],
  ['/provider/suki-customers',                     'Routes.PROVIDER.SUKI_CUSTOMERS'],
  ['/provider/tier-progression',                   'Routes.PROVIDER.TIER_PROGRESSION'],
  ['/provider/withdraw',                           'Routes.PROVIDER.WITHDRAW'],
]);

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      yield full;
    }
  }
}

function migrateFile(file) {
  let src = fs.readFileSync(file, 'utf8');
  const original = src;

  // Replace router.push / router.replace single + double-quoted paths.
  for (const [raw, constant] of MAP.entries()) {
    const escapedRaw = raw.replace(/[/.*+?^${}()|[\]\\]/g, '\\$&');
    // Single quotes
    src = src.replace(
      new RegExp(`router\\.(push|replace)\\('${escapedRaw}'(\\s*as\\s+[^)]+)?\\)`, 'g'),
      `router.$1(${constant})`,
    );
    // Double quotes
    src = src.replace(
      new RegExp(`router\\.(push|replace)\\("${escapedRaw}"(\\s*as\\s+[^)]+)?\\)`, 'g'),
      `router.$1(${constant})`,
    );
  }

  if (src === original) return false;

  // Add the import if missing.
  if (!/from ['"]@\/config\/navigation['"]/.test(src)) {
    // Insert after the last import statement; if no imports, prepend.
    const importRegex = /^import .+;\s*$/gm;
    const matches = [...src.matchAll(importRegex)];
    if (matches.length > 0) {
      const last = matches[matches.length - 1];
      const insertAt = last.index + last[0].length;
      src = src.slice(0, insertAt) + `\nimport { Routes } from '@/config/navigation';` + src.slice(insertAt);
    } else {
      src = `import { Routes } from '@/config/navigation';\n` + src;
    }
  }

  fs.writeFileSync(file, src);
  return true;
}

const ROOT = path.join(REPO_ROOT, 'apps/mobile');
const targets = [];
for (const dir of [path.join(ROOT, 'app'), path.join(ROOT, 'src')]) {
  if (fs.existsSync(dir)) targets.push(...walk(dir));
}

let changed = 0;
for (const file of targets) {
  if (migrateFile(file)) {
    console.log(`migrated: ${path.relative(REPO_ROOT, file)}`);
    changed += 1;
  }
}
console.log(`\nDone. ${changed} files changed.`);
