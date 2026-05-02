// MED-N14 + MED-N17 fix verified.
//
// MED-N14: getProviderActivity returned raw r.ip_address and
// r.user_agent unconditionally. Per Phase 14 D08 PII-masking
// policy + NPC RA 10173 §11, junior admins should see masked IPs
// + truncated user agents; only super_admin sees raw values.
//
// MED-N17: same gap on customer-admin.service.getCustomerActivity.
//
// Both fixes: function gains a `requesterRole` parameter
// defaulting to 'admin' (most-restrictive). When 'admin', IP and
// UA are passed through maskIp + maskUserAgent. When 'super_admin',
// raw values are returned. Default-to-restricted means callers
// that haven't been updated still get masking — fail-closed.

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { maskIp, maskUserAgent } from '../src/utils/pii-mask';

const PROV_ADMIN = readFileSync(
  resolve(__dirname, '../src/services/provider-admin.service.ts'),
  'utf8',
);
const CUST_ADMIN = readFileSync(
  resolve(__dirname, '../src/services/customer-admin.service.ts'),
  'utf8',
);

describe('MED-N14 — provider-admin.service.getProviderActivity masks IP+UA for junior admin', () => {
  it('signature accepts requesterRole with default \'admin\'', () => {
    expect(PROV_ADMIN).toMatch(/requesterRole: 'admin' \| 'super_admin' = 'admin'/);
  });

  it('imports maskIp + maskUserAgent dynamically', () => {
    expect(PROV_ADMIN).toMatch(/const \{ maskIp, maskUserAgent \} = await import\('\.\.\/utils\/pii-mask'\)/);
  });

  it('maskIfNeeded returns raw IP for super_admin, masked for junior admin', () => {
    expect(PROV_ADMIN).toMatch(/maskIfNeeded[\s\S]{0,200}requesterRole === 'super_admin' \? ip : maskIp\(ip\)/);
  });

  it('maskUaIfNeeded returns raw UA for super_admin, category-only for junior admin', () => {
    expect(PROV_ADMIN).toMatch(/maskUaIfNeeded[\s\S]{0,200}requesterRole === 'super_admin' \? ua : maskUserAgent\(ua\)/);
  });

  it('audit row mapping uses maskIfNeeded + maskUaIfNeeded (not raw r.ip_address)', () => {
    const block = PROV_ADMIN.match(/const audit = auditRows\.rows\.map[\s\S]*?\}\)\);/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/ipAddress: maskIfNeeded\(r\.ip_address\)/);
    expect(block![0]).toMatch(/userAgent: maskUaIfNeeded\(r\.user_agent\)/);
    // Pre-fix raw passthrough must be GONE.
    expect(block![0]).not.toMatch(/ipAddress: r\.ip_address/);
    expect(block![0]).not.toMatch(/userAgent: r\.user_agent/);
  });

  it('login row mapping uses the same masking helpers', () => {
    const block = PROV_ADMIN.match(/const logins = loginRows\.rows\.map[\s\S]*?\}\)\);/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/ipAddress: maskIfNeeded\(r\.ip_address\)/);
    expect(block![0]).toMatch(/userAgent: maskUaIfNeeded\(r\.user_agent\)/);
  });
});

describe('MED-N17 — customer-admin.service.getCustomerActivity masks IP+UA for junior admin', () => {
  it('signature accepts requesterRole with default \'admin\'', () => {
    expect(CUST_ADMIN).toMatch(/requesterRole: 'admin' \| 'super_admin' = 'admin'/);
  });

  it('imports maskIp + maskUserAgent', () => {
    expect(CUST_ADMIN).toMatch(/const \{ maskIp, maskUserAgent \} = await import\('\.\.\/utils\/pii-mask'\)/);
  });

  it('audit + login row mappings use the masking helpers', () => {
    const auditBlock = CUST_ADMIN.match(/const audit = auditRows\.rows\.map[\s\S]*?\}\)\);/);
    expect(auditBlock).not.toBeNull();
    expect(auditBlock![0]).toMatch(/ipAddress: maskIfNeeded\(r\.ip_address\)/);
    expect(auditBlock![0]).toMatch(/userAgent: maskUaIfNeeded\(r\.user_agent\)/);

    const loginBlock = CUST_ADMIN.match(/const logins = loginRows\.rows\.map[\s\S]*?\}\)\);/);
    expect(loginBlock).not.toBeNull();
    expect(loginBlock![0]).toMatch(/ipAddress: maskIfNeeded\(r\.ip_address\)/);
    expect(loginBlock![0]).toMatch(/userAgent: maskUaIfNeeded\(r\.user_agent\)/);
  });

  it('admin_action rows still pass null for ip/ua (no masking needed; never had IP)', () => {
    const block = CUST_ADMIN.match(/const adminActs = adminActionRows\.rows\.map[\s\S]*?\}\)\);/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/ipAddress: null/);
    expect(block![0]).toMatch(/userAgent: null/);
  });
});

describe('MED-N14/N17 — masking helpers behavioral smoke (sanity check)', () => {
  it('IPv4 mask keeps first 3 octets', () => {
    expect(maskIp('192.168.1.42')).toBe('192.168.1.***');
  });

  it('IPv6 mask keeps first 4 groups', () => {
    expect(maskIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe('2001:0db8:85a3:0000:****');
  });

  it('user agent maps to category', () => {
    expect(maskUserAgent('Mozilla/5.0 ... Chrome/120 ...')).toBe('Chrome');
    expect(maskUserAgent('Mozilla/5.0 ... Safari/605 ...')).toBe('Safari');
  });

  it('null IP returns empty string', () => {
    expect(maskIp(null)).toBe('');
  });
});
