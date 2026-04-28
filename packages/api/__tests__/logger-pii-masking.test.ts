import { piiMaskFormat } from '../src/utils/logger';

interface Info {
  level: string;
  message: unknown;
  [key: string]: unknown;
}

function transform(info: Info): Info | false {
  const fmt = piiMaskFormat();
  const out = fmt.transform(info);
  return out as Info | false;
}

describe('piiMaskFormat', () => {
  it('redacts PH phone in +63 format', () => {
    const out = transform({ level: 'info', message: 'Call +63 917 123 4567 now' }) as Info;
    expect(out.message).toContain('[REDACTED:phone]');
    expect(out.message).not.toContain('+63 917 123 4567');
  });

  it('redacts PH phone in 09xx format', () => {
    const out = transform({ level: 'info', message: 'Phone 09171234567' }) as Info;
    expect(out.message).toContain('[REDACTED:phone]');
    expect(out.message).not.toContain('09171234567');
  });

  it('redacts email addresses', () => {
    const out = transform({ level: 'info', message: 'User foo.bar+tag@example.com signed in' }) as Info;
    expect(out.message).toContain('[REDACTED:email]');
    expect(out.message).not.toContain('foo.bar+tag@example.com');
  });

  it('redacts TIN (NNN-NNN-NNN-NNN)', () => {
    const out = transform({ level: 'info', message: 'TIN 123-456-789-000 verified' }) as Info;
    expect(out.message).toContain('[REDACTED:tin]');
    expect(out.message).not.toContain('123-456-789-000');
  });

  it('redacts SSS (NN-NNNNNNN-N)', () => {
    const out = transform({ level: 'info', message: 'SSS 12-3456789-0 ok' }) as Info;
    expect(out.message).toContain('[REDACTED:sss]');
    expect(out.message).not.toContain('12-3456789-0');
  });

  it('redacts PhilHealth (NN-NNNNNNNNN-N)', () => {
    const out = transform({ level: 'info', message: 'PhilHealth 12-345678901-2 ok' }) as Info;
    expect(out.message).toContain('[REDACTED:philhealth]');
    expect(out.message).not.toContain('12-345678901-2');
  });

  it('redacts PayMongo IDs', () => {
    const out = transform({ level: 'info', message: 'Created cus_AbCdEf12345 and src_xyz789abc' }) as Info;
    expect(out.message).toContain('[REDACTED:paymongo]');
    expect(out.message).not.toContain('cus_AbCdEf12345');
    expect(out.message).not.toContain('src_xyz789abc');
  });

  it('redacts JWT tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature_part';
    const out = transform({ level: 'info', message: `token=${jwt}` }) as Info;
    expect(out.message).toContain('[REDACTED:jwt]');
    expect(out.message).not.toContain(jwt);
  });

  it('redacts bcrypt hashes', () => {
    const bcrypt = '$2b$12$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV12345';
    const out = transform({ level: 'info', message: `hash=${bcrypt}` }) as Info;
    expect(out.message).toContain('[REDACTED:hash]');
  });

  it('is idempotent — already-redacted strings are not re-scanned', () => {
    const out = transform({ level: 'info', message: 'value [REDACTED:email] ok user@x.co' }) as Info;
    expect(out.message).toBe('value [REDACTED:email] ok user@x.co');
  });

  it('redacts PII inside nested meta objects and arrays', () => {
    const out = transform({
      level: 'info',
      message: 'event',
      user: { email: 'a@b.co', phones: ['+639171234567'] },
      tin: '123-456-789-000',
    }) as Info;
    const user = out.user as { email: string; phones: string[] };
    expect(user.email).toBe('[REDACTED:email]');
    expect(user.phones[0]).toBe('[REDACTED:phone]');
    expect(out.tin).toBe('[REDACTED:tin]');
  });
});
