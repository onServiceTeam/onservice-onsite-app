// BUG-PHASE154-01 — two more server-side missing caps:
//
//   1. checklist.routes.ts PATCH /jobs/:id/checklist/items/:itemId
//      `notes` field had no cap (TEXT column, Postgres unbounded).
//      Provider-side checklist notes surface in admin BookingDetail
//      dispute review; an unbounded value would persist.
//
//   2. support-ticket.service.ts updateTicketStatus
//      `resolutionNotes` had no cap. Admin-supplied at status='resolved';
//      surfaces in customer-facing ticket history. The service already
//      validated subject(200) and description(5000) but missed
//      resolution_notes.
//
// Same defense-in-depth pattern as Phase 152 (portfolio + cert)
// and Phase 153 (promotion). After Phase 154, the obvious unbounded
// TEXT-column inputs are all capped.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const CHECKLIST_ROUTE = readFileSync(
  resolve(__dirname, '../src/routes/checklist.routes.ts'),
  'utf8',
);
const SUPPORT_SVC = readFileSync(
  resolve(__dirname, '../src/services/support-ticket.service.ts'),
  'utf8',
);

describe('BUG-PHASE154-01 — checklist notes + support resolutionNotes server caps', () => {
  describe('Checklist PATCH', () => {
    it('caps notes at 1000 characters', () => {
      // Match the NOTES_MAX const + the explicit length check.
      expect(CHECKLIST_ROUTE).toMatch(/const NOTES_MAX = 1000/);
      expect(CHECKLIST_ROUTE).toMatch(
        /body\.notes\.length > NOTES_MAX/,
      );
    });

    it('rejects non-string notes', () => {
      expect(CHECKLIST_ROUTE).toMatch(
        /typeof body\.notes !== 'string'[\s\S]+?notes must be a string/,
      );
    });

    it('PHASE154 fix-comment is preserved on checklist', () => {
      expect(CHECKLIST_ROUTE).toMatch(/BUG-PHASE154-01 fix/);
    });
  });

  describe('Support ticket updateTicketStatus', () => {
    it('caps resolutionNotes at 5000 characters', () => {
      expect(SUPPORT_SVC).toMatch(
        /resolutionNotes\.length > 5000[\s\S]+?5000 characters or fewer/,
      );
    });

    it('rejects non-string resolutionNotes', () => {
      expect(SUPPORT_SVC).toMatch(
        /typeof resolutionNotes !== 'string'[\s\S]+?resolutionNotes must be a string/,
      );
    });

    it('PHASE154 fix-comment is preserved on support service', () => {
      expect(SUPPORT_SVC).toMatch(/BUG-PHASE154-01 fix/);
    });
  });
});
