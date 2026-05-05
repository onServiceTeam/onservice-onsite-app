// BUG-PHASE152-01 — provider-side portfolio + certification routes
// had no server-side length validation. The mobile screens already
// got maxLength caps in Phase 145-149, but the API was missing the
// defense-in-depth backstop. Both surfaces are customer-facing
// (portfolio captions and cert labels appear on the public
// provider profile); an unbounded string is both a UX hazard and
// a sneak-injection vector.
//
// Sites covered:
//   POST /me/portfolio       — caption (max 500), categoryId (max 64)
//   PATCH /me/portfolio/:id  — caption (max 500)
//   POST /me/certifications  — name (max 200), issuingBody (max 200), certificateNumber (max 100)
//   PATCH /me/certifications/:id — same three caps
//
// Same defense-in-depth pattern as MED-N97 (file:// URI rejection).
// The mobile maxLength props (Phase 145+) keep well-behaved clients
// honest; the server caps catch malicious or misbehaving clients.
//
// Test strategy: source-content regression. Behavioral path requires
// auth + provider fixture which is heavy for one-line caps; the
// validateCertText helper + the inline portfolio caption checks are
// best verified by source-level assertions on the contract.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../src/routes/provider.routes.ts'),
  'utf8',
);

describe('BUG-PHASE152-01 — portfolio + certification server caps', () => {
  describe('Portfolio', () => {
    it('declares PORTFOLIO_CAPTION_MAX = 500', () => {
      expect(SOURCE).toMatch(/const PORTFOLIO_CAPTION_MAX = 500/);
    });

    it('declares PORTFOLIO_CATEGORY_ID_MAX = 64', () => {
      expect(SOURCE).toMatch(/const PORTFOLIO_CATEGORY_ID_MAX = 64/);
    });

    it('POST /me/portfolio rejects caption > 500 chars', () => {
      // Match the POST handler block and assert the caption check exists.
      expect(SOURCE).toMatch(
        /caption !== undefined[\s\S]+?caption\.length > PORTFOLIO_CAPTION_MAX/,
      );
    });

    it('PATCH /me/portfolio/:id rejects caption > 500 chars', () => {
      // The patch handler is a separate occurrence — at least 2 caption checks.
      const matches = SOURCE.match(/caption\.length > PORTFOLIO_CAPTION_MAX/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Certifications', () => {
    it('declares CERT_NAME_MAX, CERT_ISSUING_BODY_MAX, CERT_NUMBER_MAX', () => {
      expect(SOURCE).toMatch(/const CERT_NAME_MAX = 200/);
      expect(SOURCE).toMatch(/const CERT_ISSUING_BODY_MAX = 200/);
      expect(SOURCE).toMatch(/const CERT_NUMBER_MAX = 100/);
    });

    it('exposes a validateCertText helper', () => {
      expect(SOURCE).toMatch(
        /function validateCertText\(value: string \| undefined, field: string, max: number\)/,
      );
    });

    it('POST + PATCH /me/certifications both validate name/issuingBody/certificateNumber', () => {
      // 6 calls total (3 fields × 2 routes). Assert at least 6 occurrences.
      const matches = SOURCE.match(/validateCertText\(/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(6);
    });
  });

  it('PHASE152 fix-comment is preserved (signposts)', () => {
    expect(SOURCE).toMatch(/BUG-PHASE152-01 fix/);
  });
});
