const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));

import { getBookingProofSummary } from '../src/services/booking-proof.service';

it('Bug OPS-450 — Booking 360 derives one truthful proof summary from linked work records', async () => {
  const now = Date.now();
  dbQueryMock
    .mockResolvedValueOnce({
      rows: [{
        id: 'booking-1',
        status: 'in_progress',
        booking_type: 'quote_based',
        description: 'Post-construction cleaning',
        category_name: 'Cleaning',
        subcategory_name: null,
        customer_id: 'customer-1',
        provider_user_id: 'provider-user-1',
        scheduled_at: new Date(now - 60 * 60_000),
        work_started_at: new Date(now - 30 * 60_000),
        work_completed_at: null,
        completed_at: null,
        confirmed_at: null,
        completion_notes: null,
        updated_at: new Date(now - 5 * 60_000),
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({
      rows: [
        {
          id: 'photo-1', photo_url: 'https://example.test/after-1.jpg', photo_type: 'after',
          uploaded_by: 'provider-user-1', recorded_role: 'provider', account_role: 'provider',
          first_name: 'Ana', last_name: 'Provider', created_at: new Date(now - 10_000),
          source: 'canonical', mime_type: 'image/jpeg', original_size_bytes: 100, stored_size_bytes: 90,
        },
        {
          id: 'photo-2', photo_url: 'https://example.test/after-2.jpg', photo_type: 'after',
          uploaded_by: 'provider-user-1', recorded_role: 'provider', account_role: 'provider',
          first_name: 'Ana', last_name: 'Provider', created_at: new Date(now - 5_000),
          source: 'canonical', mime_type: 'image/jpeg', original_size_bytes: 120, stored_size_bytes: 95,
        },
      ],
      rowCount: 2,
    })
    .mockResolvedValueOnce({
      rows: [{
        checklist_id: 'checklist-1', template_version: 2, shown_at: new Date(now - 20 * 60_000),
        item_id: 'item-1', section_title: 'Final walk-through', title_snapshot: 'Photograph finished work',
        description_snapshot: null, photo_required: true, is_required: true, is_completed: true,
        completed_at: new Date(now - 60_000), photo_id: 'photo-1', notes: 'All rooms checked',
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({
      rows: [{
        id: 'signature-1', signature_type: 'customer_acceptance', signed_by: 'provider-user-1',
        signed_role: 'provider', first_name: 'Ana', last_name: 'Provider', full_name_typed: null,
        signed_at: new Date(now - 2_000), signature_url: 'https://example.test/signature.png',
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({
      rows: [{
        id: 'change-1', description: 'Add second floor', additional_amount: 250000,
        status: 'approved', photos: ['https://example.test/change.jpg'],
        customer_responded_at: new Date(now - 100_000), created_at: new Date(now - 200_000),
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({
      rows: [{
        id: 'ticket-1', ticket_number: 'SUP-1001', subject: 'Access question',
        status: 'resolved', priority: 'medium', created_at: new Date(now - 300_000),
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [{ count: '4' }], rowCount: 1 })
    .mockResolvedValueOnce({
      rows: [{
        quote_id: 'quote-1', description: 'Clean both floors', notes: 'Includes supplies',
        quoted_price: 1250000, accepted_at: new Date(now - 500_000),
        line_item_id: 'line-1', line_description: 'Final cleaning', item_type: 'labor',
        quantity: '1', unit: 'job', unit_price: 1250000, line_total: 1250000,
      }],
      rowCount: 1,
    });

  const summary = await getBookingProofSummary('booking-1');

  expect(summary.readiness).toMatchObject({
    stage: 'ready_for_provider_completion',
    readyForProviderCompletion: true,
    blockers: [],
  });
  expect(summary.checklist).toMatchObject({
    complete: true,
    completedRequiredItems: 1,
    requiredItems: 1,
  });
  expect(summary.photos.map((photo) => photo.uploadedByRole)).toEqual(['provider', 'provider']);
  expect(summary.signatures.records[0]?.attribution).toBe('provider_attributed_customer_acceptance');
  expect(summary.readiness.qualityFlags.map((flag) => flag.code)).toContain(
    'CUSTOMER_ACCEPTANCE_IDENTITY_UNVERIFIED',
  );
  expect(summary.scope.acceptedQuote?.lineItems).toHaveLength(1);
  expect(summary.changeOrders[0]?.photos).toHaveLength(1);
  expect(summary.communications).toMatchObject({ chatMessageCount: 4 });
  expect(summary.unavailable.map((item) => item.key)).toEqual([
    'gps_check_ins', 'job_receipts', 'proof_package',
  ]);
});
