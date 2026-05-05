// BUG-PHASE119-01 — CRITICAL matching bug. findMatchingProviders
// and findMatchingProvidersSimple in matching.service.ts extracted
// the booking's day-of-week and time-of-day via:
//
//   const dayOfWeek = scheduledAt.getDay();
//   const timeStr = scheduledAt.toTimeString().slice(0, 8);
//
// Both use the server's local timezone. The API container runs UTC
// (no `TZ=Asia/Manila` set in docker-compose). For a 06:00 Manila
// Thursday booking — the most common kind of "early-morning service
// at the resort" call — the UTC instant is 22:00 UTC Wednesday, so:
//
//   - getDay() returned 3 (Wed) instead of 4 (Thu)
//   - toTimeString() returned "22:00:00 GMT+0000"; .slice(0,8) gave
//     "22:00:00" instead of "06:00:00"
//
// The provider-matching SQL filtered:
//   provider_availability.day_of_week = $dayOfWeek
//   AND start_time <= $timeStr AND end_time >= $timeStr
//
// So a 06:00 Manila Thursday booking went looking for providers
// available "Wednesday at 22:00" — providers who actually work
// Thursday morning (start_time 06:00, end_time 12:00) were filtered
// OUT, while providers running an unusual late-Wed-night schedule
// got included. Customer either got the wrong match or "no
// providers available"; provider got no offers for jobs they could
// in fact have done.
//
// This is the same Manila-tz family as Phases 105/113/115/116/117/118
// but with a much bigger blast radius — every match attempt for
// every booking ran through this code.
//
// Fix: introduce manilaDayOfWeek + manilaTimeString helpers that
// extract the components in Asia/Manila, and call them from both
// matchers. Manila is +08:00 with no DST.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const MATCHING = readFileSync(
  resolve(__dirname, '../src/services/matching.service.ts'),
  'utf8',
);

describe('BUG-PHASE119-01 — provider matching uses Manila day-of-week + time, not server-local', () => {
  it('BUG-PHASE119-01 — manilaDayOfWeek helper extracts via Asia/Manila weekday', () => {
    expect(MATCHING).toMatch(
      /function manilaDayOfWeek\(scheduledAt: Date\): number \{[\s\S]+?toLocaleDateString\('en-US', \{[\s\S]+?timeZone: 'Asia\/Manila',[\s\S]+?weekday: 'short',?[\s\S]+?\}\)/,
    );
  });

  it('BUG-PHASE119-01 — manilaTimeString helper extracts HH:MM:SS via Asia/Manila', () => {
    expect(MATCHING).toMatch(
      /function manilaTimeString\(scheduledAt: Date\): string \{[\s\S]+?toLocaleTimeString\('en-GB', \{[\s\S]+?timeZone: 'Asia\/Manila',[\s\S]+?hour12: false,?[\s\S]+?\}\)/,
    );
  });

  it('BUG-PHASE119-01 — Sun..Sat → 0..6 weekday index map matches the SQL provider_availability shape', () => {
    expect(MATCHING).toMatch(
      /Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,/,
    );
  });

  it('BUG-PHASE119-01 — both matchers route through the helpers (not raw scheduledAt.getDay/toTimeString)', () => {
    // Two call sites of each helper.
    const dowMatches = MATCHING.match(/manilaDayOfWeek\(scheduledAt\)/g);
    const timeMatches = MATCHING.match(/manilaTimeString\(scheduledAt\)/g);
    expect(dowMatches?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(timeMatches?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('BUG-PHASE119-01 — pre-fix `scheduledAt.getDay()` is gone from the matchers', () => {
    expect(MATCHING).not.toMatch(/const dayOfWeek = scheduledAt\.getDay\(\);/);
  });

  it('BUG-PHASE119-01 — pre-fix `scheduledAt.toTimeString().slice(0, 8)` is gone from the matchers', () => {
    expect(MATCHING).not.toMatch(/const timeStr = scheduledAt\.toTimeString\(\)\.slice\(0, 8\);/);
  });

  it('BUG-PHASE119-01 — overnight schedule SQL preserved (regression guard for MED-N104)', () => {
    expect(MATCHING).toMatch(/pa\.start_time <= pa\.end_time/);
    expect(MATCHING).toMatch(/pa\.start_time > pa\.end_time/);
  });
});
