// BUG-PHASE147-01 — two more mobile First/Last Name input pairs
// were missing the server-cap maxLength:
//
//   1. apps/mobile/app/auth/register.tsx (registration screen)
//   2. apps/mobile/app/(tabs)/profile.tsx (customer profile edit)
//
// Server: auth.validators.ts updateProfileSchema
//   firstName: z.string().min(1).max(100).optional()
//   lastName:  z.string().min(1).max(100).optional()
//
// Continuation of the Phase 145/146 sweep. A user typing > 100
// chars in either field would pass the client check, hit the
// server's auth router, get a generic 400. Now: maxLength={100}
// matches the cap.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const REGISTER = readFileSync(
  resolve(__dirname, '../app/auth/register.tsx'),
  'utf8',
);
const PROFILE = readFileSync(
  resolve(__dirname, '../app/(tabs)/profile.tsx'),
  'utf8',
);

describe('BUG-PHASE147-01 — First/Last Name inputs enforce server max(100)', () => {
  describe('register.tsx', () => {
    it('First Name has maxLength={100}', () => {
      expect(REGISTER).toMatch(/label="First Name"[\s\S]+?maxLength=\{100\}/);
    });

    it('Last Name has maxLength={100}', () => {
      expect(REGISTER).toMatch(/label="Last Name"[\s\S]+?maxLength=\{100\}/);
    });

    it('PHASE147 fix-comment is preserved', () => {
      expect(REGISTER).toMatch(/BUG-PHASE147-01 fix/);
    });
  });

  describe('profile.tsx', () => {
    it('First Name has maxLength={100}', () => {
      expect(PROFILE).toMatch(/label="First Name"[\s\S]+?maxLength=\{100\}/);
    });

    it('Last Name has maxLength={100}', () => {
      expect(PROFILE).toMatch(/label="Last Name"[\s\S]+?maxLength=\{100\}/);
    });

    it('PHASE147 fix-comment is preserved', () => {
      expect(PROFILE).toMatch(/BUG-PHASE147-01 fix/);
    });
  });
});
