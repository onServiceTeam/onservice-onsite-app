export const CONSENT_TYPES = [
  'privacy_policy',
  'terms_of_service',
  'marketing_consent',
  'ic_agreement',
  'cookie_policy',
  'data_processing',
  'biometric_consent',
] as const;

export type ConsentType = (typeof CONSENT_TYPES)[number];

const CONSENT_TYPE_SET: ReadonlySet<string> = new Set(CONSENT_TYPES);

export function isConsentType(value: string): value is ConsentType {
  return CONSENT_TYPE_SET.has(value);
}

/**
 * Preserve the regulator-issued docket/reference exactly as entered.
 * Published NPC materials use several reference families, so the platform
 * must not invent a single canonical mask. Control characters are rejected
 * because the value is also written into case notes and audit evidence.
 */
export function normalizeIssuedNpcReference(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 100) {
    return null;
  }
  for (const character of trimmed) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 31 || codePoint === 127) return null;
  }
  return trimmed;
}
