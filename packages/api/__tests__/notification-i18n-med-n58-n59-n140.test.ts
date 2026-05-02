// MED-N58 + MED-N59 + MED-N140 fix verified.
//
// MED-N58: notification.service.notifyBookingStatusChange now reads
// the user's preferred_locale (en/tl) and translates the title +
// body via i18n.service.NOTIFICATION_CATALOG.
//
// MED-N59: cancelled_by_customer and cancelled_by_provider now
// have distinct bodies in BOTH locales (no copy-paste).
//
// MED-N140: messaging.service.BYPASS_KEYWORDS now includes Tagalog
// patterns commonly used by providers/customers steering each other
// off-platform.

import * as i18n from '../src/services/i18n.service';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('MED-N58 — i18n.service catalog has English + Tagalog for every booking-status key', () => {
  const REQUIRED_KEYS = [
    'matched',
    'paid',
    'provider_en_route',
    'provider_arrived',
    'completed_by_provider',
    'confirmed',
    'cancelled_by_customer',
    'cancelled_by_provider',
    'disputed',
  ];

  it.each(REQUIRED_KEYS)('catalog has English + Tagalog for %s', (key) => {
    const entry = i18n.NOTIFICATION_CATALOG[key];
    expect(entry).toBeDefined();
    expect(entry.en.title).toBeTruthy();
    expect(entry.en.body).toBeTruthy();
    expect(entry.tl.title).toBeTruthy();
    expect(entry.tl.body).toBeTruthy();
  });

  it('SUPPORTED_LOCALES exposes en + tl', () => {
    expect(i18n.SUPPORTED_LOCALES).toEqual(['en', 'tl']);
  });
});

describe('MED-N58 — translate() returns the correct locale or falls back to en', () => {
  it('returns Tagalog when locale=tl', () => {
    const t = i18n.translate('matched', 'tl');
    expect(t).not.toBeNull();
    expect(t!.title).toBe('May Provider Na');
  });

  it('returns English when locale=en', () => {
    const t = i18n.translate('matched', 'en');
    expect(t!.title).toBe('Provider Matched');
  });

  it('falls back to English when locale is undefined', () => {
    const t = i18n.translate('matched', undefined);
    expect(t!.title).toBe('Provider Matched');
  });

  it('falls back to English when locale is unsupported (e.g. "ja")', () => {
    const t = i18n.translate('matched', 'ja');
    expect(t!.title).toBe('Provider Matched');
  });

  it('returns null when the key is unknown', () => {
    expect(i18n.translate('not-a-real-key', 'en')).toBeNull();
  });
});

describe('MED-N59 — cancelled_by_customer and cancelled_by_provider have DISTINCT bodies in BOTH locales', () => {
  it('English bodies differ', () => {
    const c = i18n.translate('cancelled_by_customer', 'en')!;
    const p = i18n.translate('cancelled_by_provider', 'en')!;
    expect(c.body).not.toBe(p.body);
    // Sanity — each body must reference the correct actor.
    expect(c.body.toLowerCase()).toContain('customer');
    expect(p.body.toLowerCase()).toContain('provider');
  });

  it('Tagalog bodies differ', () => {
    const c = i18n.translate('cancelled_by_customer', 'tl')!;
    const p = i18n.translate('cancelled_by_provider', 'tl')!;
    expect(c.body).not.toBe(p.body);
    expect(c.body.toLowerCase()).toContain('customer');
    expect(p.body.toLowerCase()).toContain('provider');
  });
});

describe('MED-N58 — notification.service wires i18n.translate into notifyBookingStatusChange', () => {
  const SVC = readFileSync(
    resolve(__dirname, '../src/services/notification.service.ts'),
    'utf8',
  );

  it('imports i18n.service', () => {
    expect(SVC).toMatch(/import \* as i18n from '\.\/i18n\.service'/);
  });

  it('reads users.preferred_locale before translating', () => {
    expect(SVC).toMatch(/SELECT preferred_locale FROM users WHERE id = \$1/);
  });

  it('falls back to en when the lookup fails (pre-094 deployments)', () => {
    expect(SVC).toMatch(/let locale: i18n\.Locale = 'en'/);
  });

  it('calls i18n.translate(status, locale)', () => {
    expect(SVC).toMatch(/i18n\.translate\(status, locale\)/);
  });

  it('uses translated title + body for both createNotification and deliverPushToDevice', () => {
    const block = SVC.match(/notifyBookingStatusChange[\s\S]*?^}/m);
    expect(block).not.toBeNull();
    // The hardcoded English statusMessages map must be GONE.
    expect(block![0]).not.toMatch(/statusMessages: Record/);
    // And the new code uses the translated values.
    expect(block![0]).toMatch(/title,\s*body,/);
  });
});

describe('MED-N140 — messaging.service BYPASS_KEYWORDS includes Tagalog patterns', () => {
  const SVC = readFileSync(
    resolve(__dirname, '../src/services/messaging.service.ts'),
    'utf8',
  );

  it('includes the original English keywords (regression guard)', () => {
    expect(SVC).toMatch(/'gcash'/);
    expect(SVC).toMatch(/'whatsapp'/);
    expect(SVC).toMatch(/'text me'/);
  });

  it('adds Tagalog "tawagan mo ako" (call me)', () => {
    expect(SVC).toMatch(/'tawagan mo ako'/);
  });

  it('adds Tagalog "labas sa app" (outside the app)', () => {
    expect(SVC).toMatch(/'labas sa app'/);
  });

  it('adds Tagalog "deretso sa akin" (direct to me)', () => {
    expect(SVC).toMatch(/'deretso sa akin'/);
  });

  it('adds Tagalog "sariling number" (personal number)', () => {
    expect(SVC).toMatch(/'sariling number'/);
  });

  it('adds paypal (commonly suggested as off-platform payment)', () => {
    expect(SVC).toMatch(/'paypal'/);
  });

  it('does NOT add overly common Tagalog words that would false-positive (e.g. bare "pera")', () => {
    // Defensive — make sure we don't flag legitimate service discussions
    // about money/payment using the bare word.
    const block = SVC.match(/const BYPASS_KEYWORDS = \[[\s\S]*?\];/)![0];
    expect(block).not.toMatch(/'pera'\s*[,\]]/); // bare 'pera' would match too much
  });
});
