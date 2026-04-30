// Phase 14 Dispatch 08 — pii-mask utility tests.
// Bugs 66, 75, 76, 81, 287, 311, 331, 342, 343, 350.

import {
  maskIp,
  maskUserAgent,
  maskPhilippinePhone,
  maskEmail,
  maskPiiInString,
  maskPiiInObject,
  maskPiiForRole,
} from '../../src/utils/pii-mask';

describe('Bug 66 — maskIp', () => {
  it('masks IPv4 last octet', () => {
    expect(maskIp('203.0.113.42')).toBe('203.0.113.***');
  });

  it('masks IPv6 to first 4 groups + ****', () => {
    expect(maskIp('2001:db8:85a3:0:0:8a2e:370:7334')).toBe('2001:db8:85a3:0:****');
  });

  it('returns empty for null/undefined', () => {
    expect(maskIp(null)).toBe('');
    expect(maskIp(undefined)).toBe('');
  });

  it('returns "masked" for unparseable input', () => {
    expect(maskIp('not-an-ip')).toBe('masked');
  });
});

describe('Bug 66 — maskUserAgent', () => {
  it('reduces Chrome UA to "Chrome"', () => {
    expect(maskUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/118.0.0')).toBe('Chrome');
  });

  it('detects mobile iOS', () => {
    expect(maskUserAgent('OnServicePH/1.0 (iPhone; iOS 17.0)')).toBe('Mobile (iOS)');
    expect(maskUserAgent('expo/1.0 iOS')).toBe('Mobile (iOS)');
  });

  it('detects mobile Android', () => {
    expect(maskUserAgent('OnServicePH/1.0 (Android 13)')).toBe('Mobile (Android)');
  });

  it('classifies unknown as Other', () => {
    expect(maskUserAgent('curl/8.0')).toBe('Other');
  });
});

describe('Bug 287 + 343 + 350 — maskPhilippinePhone', () => {
  it('keeps last 4 digits', () => {
    expect(maskPhilippinePhone('+639171234567')).toBe('+63 9XX XXX 4567');
    expect(maskPhilippinePhone('09171234567')).toBe('+63 9XX XXX 4567');
  });

  it('handles formatted phone', () => {
    expect(maskPhilippinePhone('+63 917 123 4567')).toBe('+63 9XX XXX 4567');
  });

  it('returns empty for null', () => {
    expect(maskPhilippinePhone(null)).toBe('');
  });
});

describe('Bug 342 + 350 — maskEmail', () => {
  it('keeps first letter + domain', () => {
    expect(maskEmail('juan.delacruz@example.com')).toBe('j•••@example.com');
  });

  it('returns empty for null', () => {
    expect(maskEmail(null)).toBe('');
  });
});

describe('maskPiiInString — finds + masks embedded PII', () => {
  it('masks phone numbers in free-form text', () => {
    const masked = maskPiiInString('Customer +63 917 123 4567 reported issue');
    expect(masked).toContain('+63 9XX XXX 4567');
    expect(masked).not.toContain('917 123');
  });

  it('masks emails in free-form text', () => {
    const masked = maskPiiInString('Contact at juan@example.com please');
    expect(masked).toContain('j•••@example.com');
    expect(masked).not.toContain('juan@example.com');
  });
});

describe('maskPiiInObject — recurses into nested structures', () => {
  it('masks ip_address + user_agent at nested levels', () => {
    const masked = maskPiiInObject({
      action: 'login',
      meta: {
        ip_address: '203.0.113.42',
        user_agent: 'Mozilla/5.0 Chrome',
      },
    });
    expect(masked).toEqual({
      action: 'login',
      meta: {
        ip_address: '203.0.113.***',
        user_agent: 'Chrome',
      },
    });
  });

  it('masks phone in arbitrary string fields', () => {
    const masked = maskPiiInObject({
      reason: 'Customer +63 917 123 4567 abandoned booking',
    });
    expect((masked as { reason: string }).reason).toContain('+63 9XX XXX 4567');
  });
});

describe('Bug 66 + 75 + 76 + 81 — maskPiiForRole', () => {
  const sampleRow = {
    id: 'abc',
    ip_address: '203.0.113.42',
    user_agent: 'Mozilla/5.0 Chrome',
    phone: '+639171234567',
    email: 'juan@example.com',
    details: { nested: { ip_address: '198.51.100.5' } },
  };

  it('super_admin sees raw PII', () => {
    const out = maskPiiForRole(sampleRow, 'super_admin');
    expect(out.ip_address).toBe('203.0.113.42');
    expect(out.user_agent).toBe('Mozilla/5.0 Chrome');
    expect(out.phone).toBe('+639171234567');
    expect(out.email).toBe('juan@example.com');
  });

  it('dpo sees raw IP but masked UA + phone + email', () => {
    const out = maskPiiForRole(sampleRow, 'dpo');
    expect(out.ip_address).toBe('203.0.113.42');
    expect(out.user_agent).toBe('Chrome');
    expect(out.phone).toBe('+63 9XX XXX 4567');
    expect(out.email).toBe('j•••@example.com');
  });

  it('support admin sees fully masked', () => {
    const out = maskPiiForRole(sampleRow, 'support');
    expect(out.ip_address).toBe('203.0.113.***');
    expect(out.user_agent).toBe('Chrome');
    expect(out.phone).toBe('+63 9XX XXX 4567');
    expect(out.email).toBe('j•••@example.com');
    expect(out.details).toMatchObject({ nested: { ip_address: '198.51.100.***' } });
  });

  it('finance, dispatcher, moderator all get full masking', () => {
    for (const role of ['finance', 'dispatcher', 'moderator', 'admin', 'support_agent']) {
      const out = maskPiiForRole(sampleRow, role);
      expect(out.ip_address).toBe('203.0.113.***');
    }
  });

  it('preserves non-PII fields', () => {
    const out = maskPiiForRole(sampleRow, 'support');
    expect(out.id).toBe('abc');
  });
});
