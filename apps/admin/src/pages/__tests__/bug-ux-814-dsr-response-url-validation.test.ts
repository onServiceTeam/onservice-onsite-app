import { expect, it } from 'vitest';
import { isSecureResponseUrl } from '../DataProtectionLogPage';

it('Bug UX-814 — DSR completion accepts only an empty value or a complete HTTPS response URL', () => {
  expect(isSecureResponseUrl('')).toBe(true);
  expect(isSecureResponseUrl('https://secure.onservice.ph/dsr/export-1')).toBe(true);
  expect(isSecureResponseUrl('https://')).toBe(false);
  expect(isSecureResponseUrl('http://secure.onservice.ph/dsr/export-1')).toBe(false);
});
