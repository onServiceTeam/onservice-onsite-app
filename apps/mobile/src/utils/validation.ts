/**
 * Shared form validation helpers.
 * Used with React Hook Form + Zod schemas.
 */

import { validatePHPhone } from './phone';

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPHPhone(phone: string): boolean {
  return validatePHPhone(phone);
}

export function isValidName(name: string): boolean {
  return name.trim().length >= 2 && name.trim().length <= 100;
}

export function isValidOTP(otp: string, length: number = 6): boolean {
  return new RegExp(`^\\d{${length}}$`).test(otp);
}

export function isValidAmount(centavos: number): boolean {
  return Number.isInteger(centavos) && centavos > 0;
}
