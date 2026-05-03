// Phase 18 — sweep every admin route in headless Chromium.
// For each route:
//   * navigate, wait for networkidle
//   * screenshot
//   * capture console errors + page errors
//   * verify the route rendered SOMETHING (body text not empty, no
//     React error boundary fallback)
//   * verify expected anchor text appears (page title or known section)
//
// Output: a JSON results file + screenshots + a console summary.
// We DO NOT click interactions here — that's the wave-C deep test.
// This is pure surface coverage.

import { chromium } from '@playwright/test';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SHOTS = path.resolve(process.cwd(),
  '.ai-coder/phase-15-real-audit/screenshots/phase-18');
fs.mkdirSync(SHOTS, { recursive: true });

const ADMIN = 'http://localhost:7382';
const SUPER_ADMIN_ID = '567c0f38-31d9-45f9-88bf-7d0485f49393';

// Each entry: route, displayName, expectedAnchorText (regex or string match)
// — at least one of these MUST appear in the body text for the page to
// be considered "rendered correctly".
const ROUTES = [
  { route: '/',                          name: 'dashboard',              expects: ['Dashboard', 'Overview', 'Welcome'] },
  { route: '/providers',                 name: 'providers',              expects: ['Providers'] },
  { route: '/customers',                 name: 'customers',              expects: ['Customers'] },
  { route: '/bookings',                  name: 'bookings',               expects: ['Bookings'] },
  { route: '/catalog',                   name: 'catalog',                expects: ['Catalog', 'Categories'] },
  { route: '/disputes',                  name: 'disputes',               expects: ['Disputes'] },
  { route: '/financials',                name: 'financials',             expects: ['Financial', 'Revenue', 'GMV'] },
  { route: '/payouts',                   name: 'payouts',                expects: ['Payout', 'Provider'] },
  { route: '/notification-templates',    name: 'notification-templates', expects: ['Notification', 'Template'] },
  { route: '/recurring',                 name: 'recurring',              expects: ['Recurring'] },
  { route: '/business-accounts',         name: 'business-accounts',      expects: ['Business'] },
  { route: '/service-areas',             name: 'service-areas',          expects: ['Service Area', 'Coverage'] },
  { route: '/analytics',                 name: 'analytics',              expects: ['Analytics', 'Trend', 'Chart'] },
  { route: '/audit-log',                 name: 'audit-log',              expects: ['Audit Log'] },
  { route: '/support-tickets',           name: 'support-tickets',        expects: ['Support', 'Ticket'] },
  { route: '/staff',                     name: 'staff',                  expects: ['Staff', 'Role', 'Admin'] },
  { route: '/settings',                  name: 'settings',               expects: ['Settings'] },
  { route: '/settings/cancellation-policy', name: 'cancellation-policy', expects: ['Cancellation', 'Policy'] },
  { route: '/marketing',                 name: 'marketing',              expects: ['Marketing', 'Campaign'] },
  { route: '/dispatch',                  name: 'dispatch',               expects: ['Dispatch', 'Console'] },
  { route: '/compliance',                name: 'compliance',             expects: ['Compliance'] },
  { route: '/data-protection-log',       name: 'data-protection-log',    expects: ['Data Protection', 'DSR', 'Subject Request'] },
  { route: '/consent-versions',          name: 'consent-versions',       expects: ['Consent Versions'] },
  { route: '/pricing-rules',             name: 'pricing-rules',          expects: ['Pricing'] },
  { route: '/change-password',           name: 'change-password',        expects: ['Change password', 'Change Password'] },
  // Detail pages need a real id — pull one from the seed.
  // Filled below.
  // 404 catch-all
  { route: '/this-route-does-not-exist', name: 'not-found',              expects: ['Not found', 'Page not found', '404'] },
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

const accessToken = jwt.sign(
  { userId: SUPER_ADMIN_ID, role: 'super_admin', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' },
);
await ctx.addCookies([
  { name: 'admin_session', value: accessToken, domain: 'localhost', path: '/',
    httpOnly: true, secure: false, sameSite: 'Lax' },
]);

// Detail-page IDs — pull live IDs from Postgres.
import { Client } from 'pg';
const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();
const provIdRow = await pg.query(`SELECT id FROM providers LIMIT 1`);
const custIdRow = await pg.query(
  `SELECT id FROM users WHERE role='customer' LIMIT 1`);
const bookIdRow = await pg.query(`SELECT id FROM bookings LIMIT 1`);
const dispIdRow = await pg.query(`SELECT id FROM disputes LIMIT 1`);
await pg.end();

if (provIdRow.rows[0]) ROUTES.push({
  route: '/providers/' + provIdRow.rows[0].id,
  name: 'provider-detail',
  expects: ['Provider', 'Business', 'Service'],
});
if (custIdRow.rows[0]) ROUTES.push({
  route: '/customers/' + custIdRow.rows[0].id,
  name: 'customer-detail',
  expects: ['Customer', 'Profile', 'Bookings'],
});
if (bookIdRow.rows[0]) ROUTES.push({
  route: '/bookings/' + bookIdRow.rows[0].id,
  name: 'booking-detail',
  expects: ['Booking', 'Status'],
});
if (dispIdRow.rows[0]) ROUTES.push({
  route: '/disputes/' + dispIdRow.rows[0].id,
  name: 'dispute-detail',
  expects: ['Dispute'],
});

const results = [];
let pass = 0, fail = 0;

for (const r of ROUTES) {
  const errs = [];
  const reqFails = [];
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => errs.push('PAGEERR: ' + e.message.slice(0, 300)));
  page.on('requestfailed', req => reqFails.push(req.url() + ' ' + req.failure()?.errorText));
  page.on('response', res => {
    if (res.status() >= 500) reqFails.push(res.url() + ' ' + res.status());
  });

  let status = 'pass', detail = '';
  try {
    await page.goto(ADMIN + r.route, { waitUntil: 'networkidle', timeout: 12000 });
    await page.waitForTimeout(800);
  } catch (e) {
    status = 'fail';
    detail = 'navigation failed: ' + e.message;
  }

  let body = '';
  try { body = await page.locator('body').innerText({ timeout: 5000 }); }
  catch { body = ''; }

  await page.screenshot({ path: path.join(SHOTS, r.name + '.png') }).catch(()=>{});

  // Anchor check
  const matched = r.expects.find(t => body.includes(t));
  if (!matched && status === 'pass') {
    status = 'fail';
    detail = 'anchor not found. expected one of: ' + r.expects.join('|') +
             '. body[0..120]=' + body.slice(0, 120).replace(/\n/g, ' ');
  }

  // Critical: reject error-boundary fallback
  if (body.includes('Something went wrong. Please refresh.')) {
    status = 'fail';
    detail = 'Sentry error boundary fired';
  }

  // Critical: reject blank
  if (status === 'pass' && body.trim().length < 30) {
    status = 'fail';
    detail = 'body essentially empty (<30 chars)';
  }

  if (status === 'pass') pass++; else fail++;
  results.push({
    route: r.route, name: r.name, status, detail,
    consoleErrCount: errs.length, errs: errs.slice(0, 3),
    reqFailCount: reqFails.length, reqFails: reqFails.slice(0, 3),
  });
  console.log(
    (status === 'pass' ? '  ✓' : '  ✗') + ' ' + r.route.padEnd(34) +
    ' err=' + errs.length + ' reqFail=' + reqFails.length +
    (detail ? ' — ' + detail.slice(0, 120) : ''),
  );

  await page.close();
}

const summary = { pass, fail, total: ROUTES.length, results };
fs.writeFileSync(
  path.resolve(process.cwd(), '.ai-coder/phase-15-real-audit/PHASE-18-ADMIN-SWEEP.json'),
  JSON.stringify(summary, null, 2),
);

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail (' + ROUTES.length + ' total) ===');
await browser.close();
process.exit(fail === 0 ? 0 : 1);
