// BUG-PHASE178-01 / 02 — provider + customer notifications empty
// states had no helper text. Same UX-gap family as Phase 169-177.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const PROVIDER_SOURCE = readFileSync(
  resolve(__dirname, '../app/provider/notifications.tsx'),
  'utf8',
);

const CUSTOMER_SOURCE = readFileSync(
  resolve(__dirname, '../app/customer/notifications.tsx'),
  'utf8',
);

describe('BUG-PHASE178-01 — provider notifications empty state has helper text', () => {
  it('shows the hint about job offers / payment releases / reviews', () => {
    expect(PROVIDER_SOURCE).toMatch(
      /Job offers, payment releases, reviews, and tier updates will appear here/,
    );
  });

  it('PHASE178-01 fix-comment is preserved', () => {
    expect(PROVIDER_SOURCE).toMatch(/BUG-PHASE178-01 fix/);
  });

  it('emptyHint style is defined', () => {
    expect(PROVIDER_SOURCE).toMatch(/emptyHint:\s*\{[\s\S]+?textAlign/);
  });
});

describe('BUG-PHASE178-02 — customer notifications empty state has helper text', () => {
  it('shows the hint about booking updates / arrivals / quotes', () => {
    expect(CUSTOMER_SOURCE).toMatch(
      /Booking updates, provider arrivals, quotes, and promos will appear here/,
    );
  });

  it('PHASE178-02 fix-comment is preserved', () => {
    expect(CUSTOMER_SOURCE).toMatch(/BUG-PHASE178-02 fix/);
  });

  it('emptyHint style is defined', () => {
    expect(CUSTOMER_SOURCE).toMatch(/emptyHint:\s*\{[\s\S]+?textAlign/);
  });
});
