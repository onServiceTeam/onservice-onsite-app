// BUG-PHASE89-01 — provider Help & Support FAQ commission rates.
//
// Pre-fix the "What is the platform commission?" answer described
// commission as ranges per tier ("8-15%", "10-12%", "8-10%"). The
// actual platformConfig.commissionRates values are flat per tier:
// founding=10%, new=15%, verified=13%, pro=11%, elite=9%. The FAQ
// also omitted the verified tier entirely.
//
// Result: providers reading the FAQ expected their commission to
// drift downward within a tier as their rating climbed, but it
// doesn't — only crossing tiers changes the rate. The Verified
// tier was invisible.
//
// Fix: rewrite the answer to match the live config — flat rates,
// all tiers, plus the founding tier note.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const PROVIDER_HELP = readFileSync(
  resolve(__dirname, '../app/provider/help.tsx'),
  'utf8',
);

describe('BUG-PHASE89-01 — provider FAQ commission answer matches platformConfig', () => {
  it('BUG-PHASE89-01 — pre-fix range language is gone', () => {
    // The pre-fix copy used "ranges from 8-15%", "12-15%", "10-12%",
    // "8-10%". Make sure none of these are still on the page.
    expect(PROVIDER_HELP).not.toMatch(/Commission ranges from/);
    expect(PROVIDER_HELP).not.toMatch(/12-15%/);
    expect(PROVIDER_HELP).not.toMatch(/10-12%/);
    expect(PROVIDER_HELP).not.toMatch(/8-10%/);
  });

  it('BUG-PHASE89-01 — answer states flat rate per tier (no within-tier variability)', () => {
    expect(PROVIDER_HELP).toMatch(/flat percent per tier/i);
  });

  it('BUG-PHASE89-01 — all five canonical tiers + their actual rates appear', () => {
    // founding=10%, new=15%, verified=13%, pro=11%, elite=9%.
    expect(PROVIDER_HELP).toMatch(/New providers pay 15%/);
    expect(PROVIDER_HELP).toMatch(/Verified[\s\S]*?13%/);
    expect(PROVIDER_HELP).toMatch(/Pro[\s\S]*?11%/);
    expect(PROVIDER_HELP).toMatch(/Elite[\s\S]*?9%/);
    expect(PROVIDER_HELP).toMatch(/Founding[\s\S]*?10%/);
  });

  it('BUG-PHASE89-01 — answer notes founding tier is invite-only', () => {
    // Per provider.service.ts and DECISION-003 founding is parallel,
    // not a step on the standard ladder. The FAQ should reflect that.
    expect(PROVIDER_HELP).toMatch(/Founding[\s\S]*?invite-only/i);
  });
});
