// CRIT-N11 fix verified — admin login + 2FA verify + 2FA enable + refresh
// response bodies do NOT contain accessToken / refreshToken.
//
// Pre-fix: tokens were returned in the JSON body alongside the cookie set
// (line 580-585, 681-686, 818-822 in auth.routes.ts). XSS could read them
// from the response, defeating the HttpOnly cookie defense.
// Post-fix: response body contains only `user` + `sessionExpiresAt`.
// Tokens are accessible only via HttpOnly cookies.
//
// Static-content scan against the committed source — assertions ensure
// no future contributor accidentally re-adds the tokens to the response.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/auth.routes.ts'),
  'utf8',
);

describe('CRIT-N11 — admin login response body must not include tokens', () => {
  it('CRIT-N11 — /admin/login response body excludes accessToken+refreshToken', () => {
    // Find the /admin/login handler block.
    const adminLoginIdx = ROUTES.indexOf("'/admin/login'");
    expect(adminLoginIdx).toBeGreaterThan(0);
    // Find the next /admin/2fa/verify block as the upper bound.
    const next2faIdx = ROUTES.indexOf("'/admin/2fa/verify'", adminLoginIdx);
    expect(next2faIdx).toBeGreaterThan(adminLoginIdx);

    const loginBlock = ROUTES.slice(adminLoginIdx, next2faIdx);

    // The block must contain a setAdminSessionCookies call (cookies set).
    expect(loginBlock).toMatch(/setAdminSessionCookies\(res,/);

    // The res.json call within this block must NOT contain accessToken or
    // refreshToken on the response body. We extract the res.json(...) call
    // and check.
    const jsonStart = loginBlock.lastIndexOf('res.json({');
    expect(jsonStart).toBeGreaterThan(0);
    // Look for closing of the json call (matching brace).
    const jsonBlock = loginBlock.slice(jsonStart, jsonStart + 600);
    expect(jsonBlock).not.toMatch(/accessToken: tokens\.accessToken/);
    expect(jsonBlock).not.toMatch(/refreshToken: tokens\.refreshToken/);
    expect(jsonBlock).toMatch(/user: formatUserResponse/);
    expect(jsonBlock).toMatch(/sessionExpiresAt:/);
  });

  it('CRIT-N11 — /admin/2fa/verify response body excludes accessToken+refreshToken', () => {
    const verifyIdx = ROUTES.indexOf("'/admin/2fa/verify'");
    expect(verifyIdx).toBeGreaterThan(0);
    const setupIdx = ROUTES.indexOf("'/admin/2fa/setup'", verifyIdx);
    expect(setupIdx).toBeGreaterThan(verifyIdx);

    const block = ROUTES.slice(verifyIdx, setupIdx);
    expect(block).toMatch(/setAdminSessionCookies\(res,/);

    const jsonStart = block.lastIndexOf('res.json({');
    expect(jsonStart).toBeGreaterThan(0);
    const jsonBlock = block.slice(jsonStart, jsonStart + 600);
    expect(jsonBlock).not.toMatch(/accessToken: tokens\.accessToken/);
    expect(jsonBlock).not.toMatch(/refreshToken: tokens\.refreshToken/);
    expect(jsonBlock).toMatch(/user: formatUserResponse/);
  });

  it('CRIT-N11 — /admin/2fa/enable forced-enrol response excludes tokens', () => {
    const enableIdx = ROUTES.indexOf("'/admin/2fa/enable'");
    expect(enableIdx).toBeGreaterThan(0);
    const refreshIdx = ROUTES.indexOf("'/admin/refresh'", enableIdx);
    expect(refreshIdx).toBeGreaterThan(enableIdx);

    const block = ROUTES.slice(enableIdx, refreshIdx);
    // Forced-enrol path mints tokens via createTokenPair.
    expect(block).toMatch(/createTokenPair/);
    expect(block).toMatch(/setAdminSessionCookies\(res,/);

    // The forced-enrol res.json block.
    const setupTokenIdx = block.indexOf('req.isSetupToken');
    expect(setupTokenIdx).toBeGreaterThan(0);
    const jsonStart = block.indexOf('res.json({', setupTokenIdx);
    expect(jsonStart).toBeGreaterThan(0);
    const jsonBlock = block.slice(jsonStart, jsonStart + 600);
    expect(jsonBlock).not.toMatch(/accessToken: tokens\.accessToken/);
    expect(jsonBlock).not.toMatch(/refreshToken: tokens\.refreshToken/);
    expect(jsonBlock).toMatch(/Two-factor authentication is now enabled/);
  });

  it('CRIT-N11 — /admin/refresh response body excludes accessToken+refreshToken', () => {
    const refreshIdx = ROUTES.indexOf("'/admin/refresh'");
    expect(refreshIdx).toBeGreaterThan(0);
    const logoutIdx = ROUTES.indexOf("'/admin/logout'", refreshIdx);
    expect(logoutIdx).toBeGreaterThan(refreshIdx);

    const block = ROUTES.slice(refreshIdx, logoutIdx);
    expect(block).toMatch(/setAdminSessionCookies\(res,/);

    const jsonStart = block.lastIndexOf('res.json({');
    expect(jsonStart).toBeGreaterThan(0);
    const jsonBlock = block.slice(jsonStart, jsonStart + 600);
    expect(jsonBlock).not.toMatch(/accessToken: tokens\.accessToken/);
    expect(jsonBlock).not.toMatch(/refreshToken: tokens\.refreshToken/);
    expect(jsonBlock).toMatch(/user: formatUserResponse/);
  });
});
