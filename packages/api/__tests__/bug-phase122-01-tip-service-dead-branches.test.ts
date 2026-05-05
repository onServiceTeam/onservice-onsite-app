// BUG-PHASE122-01 — tip.service.ts carried three dead
// `if (method === 'wallet')` branches plus a
// `method === 'wallet' ? 'completed' : 'pending'` ternary inside
// sendTip's transaction body. All four were dead after the MED-N153
// fix added a `if (method !== 'wallet') throw` gate at the top of
// the function (Phase 14): once that gate runs, `method` is the
// literal string `'wallet'`, so every conditional below it always
// took the wallet branch and the 'pending' status string was
// unreachable.
//
// Same dead-branch pattern as Phases 103 (provider checklist
// INITIAL_SECTIONS), 107 (portfolio imageUrl useState), and 110
// (navigate.tsx ETA styles). Risk in this case: a future maintainer
// re-enabling non-wallet methods by lifting the MED-N153 gate
// without re-auditing the inside-of-trx logic would silently
// regress MED-N153 — non-wallet tips would insert as
// status='pending' and never get a webhook handler to flip them.
//
// Fix: collapse the dead branches into straight-through wallet
// logic. The tips INSERT now hardcodes payment_method='wallet' and
// status='completed' so the SQL itself documents the v1.0 invariant.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const TIP = readFileSync(
  resolve(__dirname, '../src/services/tip.service.ts'),
  'utf8',
);

describe('BUG-PHASE122-01 — tip.service dead method-check branches removed', () => {
  it('BUG-PHASE122-01 — pre-fix `if (method === \'wallet\')` branches inside the transaction are gone', () => {
    // The MED-N153 gate at the TOP keeps `if (method !== 'wallet')`
    // but inside the transaction every nested `if (method === 'wallet')`
    // was redundant. Make sure none survives.
    const trxBody = TIP.match(/return db\.transaction\(async \(client\) => \{[\s\S]+?\n  \}\);/);
    expect(trxBody).not.toBeNull();
    expect(trxBody?.[0]).not.toMatch(/if \(method === 'wallet'\)/);
  });

  it('BUG-PHASE122-01 — pre-fix ternary is gone from the executable code (find the tips INSERT and check its VALUES clause)', () => {
    // Anchor on the tips INSERT VALUES line — pre-fix it ended with
    // `..., method === 'wallet' ? 'completed' : 'pending', ...`.
    // Post-fix it must use literal 'wallet' + 'completed' inline.
    const insertBlock = TIP.match(/INSERT INTO tips[\s\S]+?RETURNING \*/);
    expect(insertBlock).not.toBeNull();
    expect(insertBlock?.[0]).not.toMatch(/method === 'wallet' \? 'completed' : 'pending'/);
  });

  it('BUG-PHASE122-01 — tips INSERT hardcodes wallet + completed in the SQL itself', () => {
    expect(TIP).toMatch(/VALUES \(\$1, \$2, \$3, \$4, 'wallet', 'completed', \$5\) RETURNING \*/);
  });

  it('BUG-PHASE122-01 — MED-N153 wallet-only entry gate preserved (regression guard)', () => {
    // The throw above the transaction is the contract; if a future
    // maintainer drops it, this test should fail so they pause and
    // re-audit the inside of the trx.
    expect(TIP).toMatch(/if \(method !== 'wallet'\) \{[\s\S]+?throw createAppError\(/);
  });

  it('BUG-PHASE122-01 — provider notification still wired (regression guard for the actual feature)', () => {
    expect(TIP).toMatch(/'Tip Received!'/);
    // The notifications INSERT spans lines — match across whitespace.
    expect(TIP).toMatch(/INSERT INTO notifications[\s\S]+?VALUES \(\$1, 'payment'/);
  });
});
