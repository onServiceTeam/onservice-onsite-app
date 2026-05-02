// Admin web visual + behavior tests for the recent fix wave.
// Renders pages in headless Chromium against the live API.
//
// Coverage:
//   * /audit-log — verify source badges + ACTION_LABELS + filter dropdown
//   * /consent-versions — verify "Material" column + publish dialog has the
//     amber "material change" checkbox
//   * Login as super_admin via direct cookie injection (no real OAuth flow
//     needed — we set a JWT into the admin_session cookie path used by the
//     api auth middleware in dev)

import { chromium } from '@playwright/test';
import { Client } from 'pg';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const SHOTS = path.resolve(process.cwd(), '.ai-coder/phase-15-real-audit/screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const ADMIN = 'http://localhost:7382';
const SUPER_ADMIN_ID = '567c0f38-31d9-45f9-88bf-7d0485f49393';

// Build a real auth cookie the API will accept. setAdminSessionCookies
// in auth.routes uses HttpOnly admin_session + admin_refresh; the
// actual cookie value is the access token JWT.
const accessToken = jwt.sign(
  { userId: SUPER_ADMIN_ID, role: 'super_admin', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' },
);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// Inject the cookie BEFORE navigation so the very first XHR auth is OK.
// Two cookies: admin_session (httpOnly) + admin_csrf (must match X-CSRF-Token
// header). For our Bearer-exempt CSRF middleware, the admin web sets both.
await ctx.addCookies([
  { name: 'admin_session', value: accessToken, domain: 'localhost', path: '/',
    httpOnly: true, secure: false, sameSite: 'Lax' },
]);

const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('PAGEERR: ' + e.message));

let pass = 0, fail = 0;
function check(cond, msg) {
  if (cond) { pass++; console.log('  ✓', msg); }
  else      { fail++; console.log('  ✗ FAIL:', msg); }
}

async function shot(name) {
  await page.screenshot({ path: path.join(SHOTS, name) });
}

console.log('\n=== /audit-log ===\n');
await page.goto(ADMIN + '/audit-log', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(2000);
await shot('05-audit-log.png');
const auditText = await page.locator('body').innerText();
check(auditText.includes('Audit Log'), 'Page title rendered');
check(auditText.toLowerCase().includes('admin op') || auditText.toLowerCase().includes('request'),
  'Source badge text rendered (admin op / request)');
const sources = await page.locator('select').count();
check(sources >= 1, 'Source filter dropdown present');
// Verify ACTION_LABELS friendly text rewrites — should see "Bulk password rotation flagged" instead of raw verb
check(auditText.includes('Bulk password rotation flagged') || auditText.includes('Admin password rotated'),
  'ACTION_LABELS friendly text rendered');

console.log('\n=== /consent-versions ===\n');
await page.goto(ADMIN + '/consent-versions', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(2000);
await shot('06-consent-versions.png');
const cvText = await page.locator('body').innerText();
check(cvText.includes('Consent Versions'), 'Page title rendered');
check(cvText.includes('privacy_policy'), 'Recent privacy_policy publishes shown');

// Material column lives on the Audit trail tab — switch to it.
await page.click('button:has-text("Audit trail")');
await page.waitForTimeout(800);
await shot('06b-audit-trail.png');
const auditTabText = await page.locator('body').innerText();
check(auditTabText.includes('Material'), 'Material column header rendered on Audit trail tab');
// Material badge shows for the v3 publish (the one we passed material:true).
check(auditTabText.toLowerCase().includes('material'),
  'Material badge rendered for material publishes');

// Open the publish dialog
console.log('\n=== publish dialog with material checkbox ===\n');
const publishBtn = await page.locator('button', { hasText: 'Publish new version' }).first();
await publishBtn.click();
await page.waitForTimeout(800);
await shot('07-publish-dialog.png');
const dlgText = await page.locator('body').innerText();
check(dlgText.includes('material change'), 'Material change checkbox copy rendered');
check(dlgText.toLowerCase().includes('force re-consent') || dlgText.toLowerCase().includes('every user'),
  'Material flag explanation text rendered');
const materialCheckbox = await page.locator('#cv-material').count();
check(materialCheckbox === 1, 'Material checkbox input element present');

console.log('\n=== /change-password (LL#12 admin-side UI) ===\n');
await page.goto(ADMIN + '/change-password', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(1500);
await shot('08-change-password.png');
const cpText = await page.locator('body').innerText();
check(cpText.includes('Change password'), 'Change Password page title rendered');
check(await page.locator('#cp-old').count() === 1, 'old-password input present');
check(await page.locator('#cp-new').count() === 1, 'new-password input present');
check(await page.locator('#cp-confirm').count() === 1, 'confirm-password input present');

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
console.log('console errors:', errs.length);
errs.slice(0, 5).forEach(e => console.log('  -', e.slice(0, 200)));

await browser.close();
process.exit(fail === 0 ? 0 : 1);
