/**
 * Philippine phone number formatting and validation.
 * Format: +63 9XX XXX XXXX
 */

const PH_PHONE_REGEX = /^(\+63|0)?9\d{9}$/;

export function validatePHPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  return PH_PHONE_REGEX.test(cleaned);
}

export function formatPHPhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, '');

  let digits: string;
  if (cleaned.startsWith('+63')) {
    digits = cleaned.slice(3);
  } else if (cleaned.startsWith('0')) {
    digits = cleaned.slice(1);
  } else {
    digits = cleaned;
  }

  if (digits.length !== 10 || !digits.startsWith('9')) {
    return phone;
  }

  return `+63 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

export function normalizePHPhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+63')) return cleaned;
  if (cleaned.startsWith('0')) return `+63${cleaned.slice(1)}`;
  if (cleaned.startsWith('9')) return `+63${cleaned}`;
  return cleaned;
}
