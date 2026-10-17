import { buildEmailCodeMessage, formatManilaTime } from '../src/services/email-code-message';

// D37 (Ken, 2026-10-11): a short, professional email with a clear subject and
// the code bigger and bolder than everything else.

// 2026-10-12 03:41:07 UTC = 11:41 AM in Manila (UTC+8, no daylight saving).
const expiresAt = new Date('2026-10-12T03:41:07.123Z');

it('D37 - the sign-in email has a clear subject, a text part and an HTML part with the code standing out', () => {
  const message = buildEmailCodeMessage({ code: '042917', purpose: 'sign_in', expiresAt, validMinutes: 5 });
  expect(message.subject).toBe('Your onService PH sign-in code');
  expect(message.text).toBe([
    'Use this code to sign in to onService PH:',
    '042917',
    'This code expires at 11:41 AM Philippine time, 5 minutes after it was requested.',
    'If you did not try to sign in, you can ignore this email. Your account is not changed.',
    'Never share this code. onService PH staff will never ask you for it.',
    'Please do not reply to this email. This address is not monitored.',
    'onService PH',
  ].join('\n\n'));
  // Largest, boldest text in the message, in its own block.
  expect(message.html).toContain('font-size:40px;line-height:48px;font-weight:bold;letter-spacing:10px;color:#003D9B;">042917</div>');
  const sizes = [...message.html.matchAll(/font-size:(\d+)px/g)].map(match => Number(match[1]));
  expect(Math.max(...sizes)).toBe(40);
  expect(sizes.filter(size => size === 40)).toHaveLength(1);
  expect(message.html).toContain('<strong>This code expires at 11:41 AM Philippine time, 5 minutes after it was requested.</strong>');
  expect(message.html).toMatch(/^<!doctype html>/);
  // No images, links or tracking, which spam filters distrust in short mail.
  expect(message.html).not.toMatch(/<img|<a\s|https?:\/\//i);
});

it('D37 - the code is not in the subject; the preview line shows the fixed expiry, padded so it stops there', () => {
  const message = buildEmailCodeMessage({ code: '913355', purpose: 'sign_in', expiresAt, validMinutes: 5 });
  expect(message.subject).not.toContain('913355');
  const preview = /<div style="display:none[^>]*>([^<]*)<\/div>/.exec(message.html)?.[1] ?? '';
  expect(preview.startsWith('This code expires at 11:41 AM Philippine time.')).toBe(true);
  expect(preview).not.toContain('913355');
  // Padding keeps preview snippets from running on into the body and the code.
  expect(preview.split('&zwnj;').length - 1).toBeGreaterThanOrEqual(50);
  // A resend late in the window must not claim a fresh five minutes there.
  expect(message.html).not.toContain('valid for 5 minutes');
});

it('D37 - the do-not-reply line appears only while replies are not monitored', () => {
  const unmonitored = buildEmailCodeMessage({ code: '123456', purpose: 'sign_in', expiresAt, validMinutes: 5 });
  const monitored = buildEmailCodeMessage({ code: '123456', purpose: 'sign_in', expiresAt, validMinutes: 5, replyMonitored: true });
  expect(unmonitored.html).toContain('Please do not reply to this email.');
  expect(monitored.html).not.toContain('do not reply');
  expect(monitored.text).not.toContain('do not reply');
});

it('D37 - admin and email-linking messages say what they are for', () => {
  const admin = buildEmailCodeMessage({ code: '123456', purpose: 'admin_sign_in', expiresAt, validMinutes: 5 });
  expect(admin.subject).toBe('Your onService PH admin sign-in code');
  expect(admin.text.split('\n\n')[0]).toBe('Use this code to finish signing in to the onService PH admin console:');
  // An unexpected admin code means someone else knows the password.
  expect(admin.text).toContain('If you did not just sign in, someone has your password: change it now and tell a super admin.');
  expect(admin.text).not.toContain('you can ignore this email');
  const link = buildEmailCodeMessage({ code: '123456', purpose: 'link_email', expiresAt, validMinutes: 5 });
  expect(link.subject).toBe('Confirm your onService PH sign-in email');
});

it('D37 - a resend of the same code produces exactly the same message', () => {
  const first = buildEmailCodeMessage({ code: '555123', purpose: 'sign_in', expiresAt, validMinutes: 5 });
  const again = buildEmailCodeMessage({ code: '555123', purpose: 'sign_in', expiresAt, validMinutes: 5 });
  expect(again).toEqual(first);
});

it('D37 - malformed codes and windows are refused rather than sent', () => {
  for (const code of ['12345', '1234567', '12a456', '']) {
    expect(() => buildEmailCodeMessage({ code, purpose: 'sign_in', expiresAt, validMinutes: 5 })).toThrow('six digits');
  }
  for (const validMinutes of [0, 11, 2.5]) {
    expect(() => buildEmailCodeMessage({ code: '123456', purpose: 'sign_in', expiresAt, validMinutes })).toThrow('1 to 10');
  }
});

// House logo (Ken, 2026-10-14). Email is the one place the house tile cannot go:
// Gmail and Outlook drop inline SVG and block data: images, and D37 bans
// images and links (see the first test). Whether to add the tile as an inline
// (CID) picture is Ken's open question in
// .ai-coder/decisions/D42-house-logo-in-email.md. Until he answers, every
// sign-in email carries the logo as the one-colour text wordmark only: brand
// blue, never two-tone, never orange, and never the old "oS" letters.
it('D37 guard (house logo, 2026-10-14): every sign-in email shows the one-colour "onService PH" wordmark, with no oS mark and no orange', () => {
  for (const purpose of ['sign_in', 'admin_sign_in', 'link_email'] as const) {
    const message = buildEmailCodeMessage({ code: '204816', purpose, expiresAt, validMinutes: 5 });
    expect(message.html).toContain('font-weight:bold;color:#003D9B;">onService PH</td>');
    expect(message.html).not.toMatch(/>\s*oS\s*</);
    expect(message.html).not.toMatch(/#?(FE8A00|FF8A00|FF6B35)\b|orange/i);
    expect(message.html).not.toMatch(/<svg|<img|<b>on|<span[^>]*>Service/i);
    expect(message.text.split('\n\n').at(-1)).toBe('onService PH');
  }
});

it('D37 - Manila time is shown without daylight saving all year', () => {
  expect(formatManilaTime(new Date('2026-01-15T16:05:00Z'))).toBe('12:05 AM');
  expect(formatManilaTime(new Date('2026-07-15T04:30:59Z'))).toBe('12:30 PM');
});
