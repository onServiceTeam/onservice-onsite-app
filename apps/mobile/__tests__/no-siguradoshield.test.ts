// Phase 14 Dispatch 04 — SiguradoShield pull (Option A).
//
// Static-content negative tests for the 8 D04 bugs. Each bug-tagged describe
// asserts the corresponding source file does NOT contain SiguradoShield
// trademark, peso-amount insurance coverage figures, or insurance-shaped
// identifiers. Static-content tests (rather than React Native component
// renders) deliberately — they are immune to JSX render-tree quirks and
// catch reintroductions in code regardless of whether the component renders
// the offending text on every code path.
//
// Gate B parses this file for "Bug NNNN" references; each describe block
// satisfies that requirement.

import { readFileSync } from 'fs';
import { join } from 'path';

const REPO_MOBILE = join(__dirname, '..');

function source(relPath: string): string {
  return readFileSync(join(REPO_MOBILE, relPath), 'utf-8');
}

const TRADEMARK = /SiguradoShield/;
const PESO_25K = /₱25,000/;
const PESO_50K = /₱50,000/;
const PESO_100K = /₱100,000/;
const SHIELD_IDENT = /siguradoShield[A-Za-z]/;

function commentStripped(src: string): string {
  // Strip JS/TS line comments and block comments before assertion.
  // Comments documenting the REMOVAL legitimately reference SiguradoShield;
  // we only care that user-facing copy and code identifiers are clean.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')        // block comments
    .replace(/^\s*\/\/.*$/gm, '')             // line comments
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');   // JSX comments
}

describe('Bug 1168 — apps/mobile/src/config/platform.config.ts', () => {
  const src = commentStripped(source('src/config/platform.config.ts'));

  it('does not declare siguradoShield* constants', () => {
    expect(src).not.toMatch(SHIELD_IDENT);
  });
});

describe('Bug 860 — apps/mobile/app/onboarding.tsx', () => {
  const src = commentStripped(source('app/onboarding.tsx'));

  it('does not display SiguradoShield trademark in slide content', () => {
    expect(src).not.toMatch(TRADEMARK);
  });

  it('does not reference siguradoShield* identifiers', () => {
    expect(src).not.toMatch(SHIELD_IDENT);
  });

  it('does not display peso-amount insurance coverage figures', () => {
    expect(src).not.toMatch(PESO_25K);
    expect(src).not.toMatch(PESO_50K);
    expect(src).not.toMatch(PESO_100K);
  });
});

describe('Bug 889 — apps/mobile/app/(tabs)/home.tsx', () => {
  const src = commentStripped(source('app/(tabs)/home.tsx'));

  it('does not render SiguradoShield banner copy', () => {
    expect(src).not.toMatch(TRADEMARK);
  });

  it('does not reference siguradoShield* identifiers', () => {
    expect(src).not.toMatch(SHIELD_IDENT);
  });

  it('does not embed peso-amount coverage figures in banner copy', () => {
    expect(src).not.toMatch(PESO_50K);
  });
});

describe('Bug 920 — apps/mobile/app/(tabs)/profile.tsx', () => {
  const src = commentStripped(source('app/(tabs)/profile.tsx'));

  it('does not include a SiguradoShield Protection menu row', () => {
    expect(src).not.toMatch(TRADEMARK);
  });
});

describe('Bug 538 — apps/mobile/app/customer/safety-and-support.tsx', () => {
  const src = commentStripped(source('app/customer/safety-and-support.tsx'));

  it('does not display SiguradoShield trademark in user copy', () => {
    expect(src).not.toMatch(TRADEMARK);
  });

  it('does not reference siguradoShield* identifiers', () => {
    expect(src).not.toMatch(SHIELD_IDENT);
  });

  it('does not display peso-amount insurance coverage figures', () => {
    expect(src).not.toMatch(PESO_25K);
    expect(src).not.toMatch(PESO_50K);
    expect(src).not.toMatch(PESO_100K);
  });

  it('does not POSITIVELY claim insurance coverage', () => {
    // Phase 14 R10 added an explicit no-insurance disclaimer
    // ("We do not provide insurance coverage..."). The disclaimer is
    // exactly the audit-required language, so the regex below permits
    // disclaimer phrasing while still blocking marketing-as-insurance.
    expect(src).not.toMatch(/\bdeductible\b/i);
    expect(src).not.toMatch(/\bcovered up to\b/i);
    // Block phrases that ASSERT we provide insurance.
    expect(src).not.toMatch(/\bwe (?:provide|offer|carry|hold) insurance/i);
    expect(src).not.toMatch(/\binsurance\s+(?:coverage|protection|policy|cap|limit)\b/i);
  });

  it('still displays verifiable trust claims', () => {
    expect(src).toMatch(/NBI/);
    expect(src).toMatch(/escrow/i);
    expect(src).toMatch(/tracking/i);
  });
});

describe('Bug 538 — apps/mobile/app/customer/safety.tsx (renamed)', () => {
  it('the old safety.tsx file is removed (renamed to safety-and-support.tsx)', () => {
    let exists = true;
    try {
      readFileSync(join(REPO_MOBILE, 'app/customer/safety.tsx'), 'utf-8');
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });
});

describe('Bug 983 — apps/mobile/app/customer/payment-methods.tsx', () => {
  const src = commentStripped(source('app/customer/payment-methods.tsx'));

  it('escrow info box does not advertise SiguradoShield', () => {
    expect(src).not.toMatch(TRADEMARK);
  });

  it('escrow info box does not embed peso-amount insurance coverage', () => {
    expect(src).not.toMatch(PESO_50K);
    expect(src).not.toMatch(PESO_100K);
  });

  it('still describes escrow protection in factual terms', () => {
    expect(src).toMatch(/escrow/i);
  });
});

describe('Bug 686 — apps/mobile/app/customer/help.tsx', () => {
  const src = commentStripped(source('app/customer/help.tsx'));

  it('does not include the "What is SiguradoShield" FAQ entry', () => {
    expect(src).not.toMatch(TRADEMARK);
  });
});

describe('Bug 834 — leftover SiguradoShield refs across customer surfaces', () => {
  const surfaces: Array<[string, string]> = [
    ['terms', 'app/customer/terms.tsx'],
    ['provider detail', 'app/customer/provider/[id].tsx'],
    ['booking checkout', 'app/customer/booking/checkout.tsx'],
    ['booking confirm', 'app/customer/booking/confirm.tsx'],
  ];

  for (const [label, path] of surfaces) {
    describe(`Bug 834 — ${label} (${path})`, () => {
      const src = commentStripped(source(path));

      it('does not display SiguradoShield trademark', () => {
        expect(src).not.toMatch(TRADEMARK);
      });

      it('does not reference siguradoShield* identifiers', () => {
        expect(src).not.toMatch(SHIELD_IDENT);
      });
    });
  }
});
