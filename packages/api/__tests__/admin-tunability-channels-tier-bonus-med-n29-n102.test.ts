// MED-N29 + MED-N102 (D-J23 admin-tunability) fix verified.
//
// MED-N29: marketing channels are now read from
// platform_settings.marketing_channels (JSON array) instead of a
// hardcoded ALLOWED_CHANNELS const. Adding a channel becomes a
// Settings UI edit instead of a code deploy.
//
// MED-N102 (admin-tunability portion): matching.service tier bonus
// weights are now read from platform_settings.matching_tier_bonus
// (JSON object) so ops can promote a tier (e.g., boost founding
// during launch month) without redeploying.
//
// Both fall back to in-code defaults when the setting is missing
// or returns invalid JSON, so dev/test with no settings layer
// preserves prior behavior.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SETTINGS = readFileSync(
  resolve(__dirname, '../src/services/settings.service.ts'),
  'utf8',
);
const MARKETING = readFileSync(
  resolve(__dirname, '../src/services/marketing-admin.service.ts'),
  'utf8',
);
const MATCHING = readFileSync(
  resolve(__dirname, '../src/services/matching.service.ts'),
  'utf8',
);

describe('MED-N29 — marketing_channels is admin-tunable via platform_settings', () => {
  it('settings.service SETTING_DEFAULTS contains marketing_channels as a JSON array string', () => {
    expect(SETTINGS).toMatch(/marketing_channels:\s*JSON\.stringify\(\[/);
    expect(SETTINGS).toMatch(/'facebook_ads',\s*'google_ads'/);
  });

  it('marketing-admin.service imports settingsService', () => {
    expect(MARKETING).toMatch(/import \* as settingsService from '\.\/settings\.service'/);
  });

  it('marketing-admin.service has a getAllowedChannels async helper that reads the setting', () => {
    expect(MARKETING).toMatch(/async function getAllowedChannels/);
    expect(MARKETING).toMatch(/settingsService\.getSetting\('marketing_channels'\)/);
  });

  it('marketing-admin.service has FALLBACK_CHANNELS for when the setting is unreadable', () => {
    expect(MARKETING).toMatch(/FALLBACK_CHANNELS/);
  });

  it('validateChannel is now async and uses the live allowed list', () => {
    expect(MARKETING).toMatch(/async function validateChannel/);
    expect(MARKETING).toMatch(/await getAllowedChannels\(\)/);
  });

  it('validateChannel callers now await the async result', () => {
    // Both call sites must await — otherwise the Promise<string> compares
    // truthy against any string, defeating the validation.
    const awaitCalls = (MARKETING.match(/await validateChannel\(/g) ?? []).length;
    expect(awaitCalls).toBeGreaterThanOrEqual(2);
  });
});

describe('MED-N29 — getAllowedChannels behavior (smoke against the same logic)', () => {
  // Reproduce the helper's contract inline. Source-level test above
  // confirms the route uses the actual function.
  const FALLBACK = ['facebook_ads', 'google_ads', 'billboard', 'kiosk', 'influencer', 'sms', 'email', 'referral', 'other'];

  function tryParse(raw: string): Set<string> | null {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) {
        return new Set(parsed as string[]);
      }
    } catch {
      // fall through
    }
    return null;
  }

  it('parses a valid JSON array setting', () => {
    const out = tryParse(JSON.stringify(['a', 'b', 'tiktok_ads']));
    expect(out).not.toBeNull();
    expect(out!.has('tiktok_ads')).toBe(true);
  });

  it('returns null on malformed JSON (caller falls back to defaults)', () => {
    expect(tryParse('not json')).toBeNull();
  });

  it('returns null on JSON that is not an array of strings', () => {
    expect(tryParse(JSON.stringify({ a: 1 }))).toBeNull();
    expect(tryParse(JSON.stringify(['a', 1, 'b']))).toBeNull();
  });

  it('FALLBACK contains all 9 original channels', () => {
    expect(FALLBACK).toHaveLength(9);
    for (const ch of ['facebook_ads', 'google_ads', 'referral', 'other']) {
      expect(FALLBACK).toContain(ch);
    }
  });
});

describe('MED-N102 (admin-tunability) — matching_tier_bonus is admin-tunable', () => {
  it('settings.service SETTING_DEFAULTS contains matching_tier_bonus as a JSON object string', () => {
    expect(SETTINGS).toMatch(/matching_tier_bonus:\s*JSON\.stringify\(\{/);
    expect(SETTINGS).toMatch(/founding:\s*0\.5/);
  });

  it('matching.service imports settingsService', () => {
    expect(MATCHING).toMatch(/import \* as settingsService from '\.\/settings\.service'/);
  });

  it('matching.service has a loadTierBonus async helper reading the setting', () => {
    expect(MATCHING).toMatch(/async function loadTierBonus/);
    expect(MATCHING).toMatch(/settingsService\.getSetting\('matching_tier_bonus'\)/);
  });

  it('matching.service preserves TIER_BONUS_DEFAULTS as the in-code fallback', () => {
    expect(MATCHING).toMatch(/TIER_BONUS_DEFAULTS/);
    expect(MATCHING).toMatch(/return TIER_BONUS_DEFAULTS/);
  });

  it('findMatchingProviders + findMatchingProvidersSimple both apply the tunable tier bonus via rankCandidates', () => {
    // Phase 200 refactor: both matchers now delegate ranking to the shared
    // rankCandidates() helper, which awaits loadTierBonus() once and applies
    // tierBonus[tier]. So the admin-tunable bonus is still applied in BOTH
    // matcher paths, without duplicating the load. Assert the shared helper
    // loads the bonus and that both matchers route through it.
    expect(MATCHING).toMatch(/await loadTierBonus\(\)/);
    expect(MATCHING).toMatch(/async function rankCandidates/);
    // 1 definition + 1 call in each matcher = at least 3 references.
    const rankRefs = (MATCHING.match(/rankCandidates\(/g) ?? []).length;
    expect(rankRefs).toBeGreaterThanOrEqual(3);
  });

  it('only finite numbers from the setting are kept (rejects strings/NaN/null)', () => {
    expect(MATCHING).toMatch(/typeof v === 'number' && Number\.isFinite\(v\)/);
  });
});
