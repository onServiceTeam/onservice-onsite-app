// BUG-PHASE146-01 — three more mobile inputs were missing the
// `maxLength` cap that the server enforces:
//
//   1. apps/mobile/app/customer/booking/form.tsx — Notes input
//      (server: createBookingSchema.description.max(2000))
//   2. apps/mobile/app/customer/booking/[id].tsx — cancelReason
//      (server: updateBookingStatusSchema.cancellationReason.max(500))
//   3. apps/mobile/app/provider/job/[id].tsx — cancelReason
//      (server: same max(500))
//
// Same fix family as Phase 145 (review comment + privateNote). A
// customer/provider could type unbounded text, hit submit, and get
// a generic 400 from the server's validator. Now: maxLength props
// hard-stop at the server cap so the input matches the contract.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const FORM = readFileSync(
  resolve(__dirname, '../app/customer/booking/form.tsx'),
  'utf8',
);
const CUST_BOOKING_DETAIL = readFileSync(
  resolve(__dirname, '../app/customer/booking/[id].tsx'),
  'utf8',
);
const PROV_JOB_DETAIL = readFileSync(
  resolve(__dirname, '../app/provider/job/[id].tsx'),
  'utf8',
);

describe('BUG-PHASE146-01 — booking form notes + cancelReason inputs enforce server caps', () => {
  describe('customer/booking/form.tsx Notes input', () => {
    it('Notes Input has maxLength={2000} (server description.max(2000))', () => {
      expect(FORM).toMatch(
        /label="Additional Notes \(optional\)"[\s\S]+?maxLength=\{2000\}/,
      );
    });

    it('PHASE146 fix-comment is preserved', () => {
      expect(FORM).toMatch(/BUG-PHASE146-01 fix/);
    });
  });

  describe('customer/booking/[id].tsx cancelReason TextInput', () => {
    it('cancelReason TextInput has maxLength={500}', () => {
      expect(CUST_BOOKING_DETAIL).toMatch(
        /placeholder="Tell us why\.\.\."[\s\S]+?maxLength=\{500\}/,
      );
    });

    it('PHASE146 fix-comment is preserved', () => {
      expect(CUST_BOOKING_DETAIL).toMatch(/BUG-PHASE146-01 fix/);
    });
  });

  describe('provider/job/[id].tsx cancelReason TextInput', () => {
    it('cancelReason TextInput has maxLength={500}', () => {
      expect(PROV_JOB_DETAIL).toMatch(
        /placeholder="Tell the customer why\.\.\."[\s\S]+?maxLength=\{500\}/,
      );
    });

    it('PHASE146 fix-comment is preserved', () => {
      expect(PROV_JOB_DETAIL).toMatch(/BUG-PHASE146-01 fix/);
    });
  });
});
