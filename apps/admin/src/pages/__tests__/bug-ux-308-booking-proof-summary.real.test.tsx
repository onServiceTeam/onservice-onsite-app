import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: { get, post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  getErrorMessage: () => 'Request failed',
}));

import { EvidenceTab } from '../BookingDetailPage';

it('Bug UX-308 — Booking 360 renders checklist, provenance, signature caveat, blockers, and unavailable proof fields', async () => {
  get.mockResolvedValueOnce({
    data: {
      success: true,
      data: {
        booking: {
          id: 'booking-1', status: 'in_progress', bookingType: 'quote_based',
          description: 'Post-construction cleaning', categoryName: 'Cleaning', subcategoryName: null,
          scheduledAt: '2026-08-25T08:00:00.000Z', workStartedAt: '2026-08-25T08:00:00.000Z',
          workCompletedAt: null, completedAt: null, confirmedAt: null,
          completionNotes: 'Final walkthrough pending.',
        },
        scope: {
          acceptedQuote: {
            id: 'quote-1', description: 'Clean both floors', notes: 'Includes supplies',
            quotedPrice: 1250000, acceptedAt: '2026-08-24T08:00:00.000Z',
            lineItems: [{
              id: 'line-1', description: 'Final cleaning', itemType: 'labor', quantity: 1,
              unit: 'job', unitPrice: 1250000, lineTotal: 1250000,
            }],
          },
        },
        readiness: {
          stage: 'ready_for_provider_completion', readyForProviderCompletion: true,
          minimumTimeOnSiteMinutes: 15, afterPhotosRequired: 2, blockers: [],
          qualityFlags: [{
            code: 'CUSTOMER_ACCEPTANCE_IDENTITY_UNVERIFIED',
            message: 'Provider-side account captured the acceptance image.',
          }],
        },
        checklist: {
          id: 'checklist-1', templateVersion: 2, shownAt: '2026-08-25T08:05:00.000Z',
          totalItems: 1, requiredItems: 1, completedRequiredItems: 1, complete: true,
          items: [{
            id: 'item-1', sectionTitle: 'Final walk-through', title: 'Photograph finished work',
            description: null, required: true, photoRequired: true, completed: true,
            completedAt: '2026-08-25T08:20:00.000Z', photoId: 'photo-1', notes: 'All rooms checked',
          }],
        },
        photos: [
          {
            id: 'photo-1', url: 'https://example.test/after-1.jpg', photoType: 'after',
            uploadedByUserId: 'provider-user-1', uploadedByRole: 'provider', uploaderName: 'Ana Provider',
            uploadedAt: '2026-08-25T08:20:00.000Z', source: 'canonical', mimeType: 'image/jpeg',
            originalSizeBytes: 100, storedSizeBytes: 90,
          },
          {
            id: 'photo-2', url: 'https://example.test/after-2.jpg', photoType: 'after',
            uploadedByUserId: 'provider-user-1', uploadedByRole: 'provider', uploaderName: 'Ana Provider',
            uploadedAt: '2026-08-25T08:21:00.000Z', source: 'canonical', mimeType: 'image/jpeg',
            originalSizeBytes: 100, storedSizeBytes: 90,
          },
        ],
        photoCounts: { after: 2 },
        signatures: {
          identityCaveat: 'Provider-attributed customer acceptance is not verified customer approval while E19 is open.',
          records: [{
            id: 'signature-1', signatureType: 'customer_acceptance', signedByUserId: 'provider-user-1',
            signedByRole: 'provider', signerName: 'Ana Provider', fullNameTyped: null,
            signedAt: '2026-08-25T08:22:00.000Z', url: 'https://example.test/signature.png',
            attribution: 'provider_attributed_customer_acceptance',
          }],
        },
        changeOrders: [{
          id: 'change-1', description: 'Add second floor', additionalAmount: 250000,
          status: 'approved', photos: ['https://example.test/change.jpg'],
          customerRespondedAt: '2026-08-24T10:00:00.000Z', createdAt: '2026-08-24T09:00:00.000Z',
        }],
        communications: {
          chatMessageCount: 4,
          supportTickets: [{
            id: 'ticket-1', ticketNumber: 'SUP-1001', subject: 'Access question',
            status: 'resolved', priority: 'medium', createdAt: '2026-08-24T08:00:00.000Z',
          }],
        },
        dispute: null,
        unavailable: [
          { key: 'gps_check_ins', label: 'Visit GPS check-ins', reason: 'No visit-level GPS record.' },
          { key: 'job_receipts', label: 'Job receipts and readings', reason: 'No structured receipt record.' },
          { key: 'proof_package', label: 'Closeout proof package', reason: 'Not implemented yet.' },
        ],
      },
    },
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <EvidenceTab bookingId="booking-1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Completion readiness')).toBeTruthy();
  expect(screen.getByText('Ready to submit')).toBeTruthy();
  expect(screen.getByText('Photograph finished work')).toBeTruthy();
  expect(screen.getAllByText('Ana Provider').length).toBeGreaterThan(0);
  expect(screen.getByText(/Identity caution \(E19\)/)).toBeTruthy();
  expect(screen.getByText('Add second floor')).toBeTruthy();
  expect(screen.getByText('SUP-1001')).toBeTruthy();
  expect(screen.getByText('Visit GPS check-ins')).toBeTruthy();
  expect(screen.getByText('Job receipts and readings')).toBeTruthy();
  expect(screen.getByText('Closeout proof package')).toBeTruthy();
  expect(screen.queryByText('No GPS check-ins recorded.')).toBeNull();
  expect(get).toHaveBeenCalledWith('/api/v1/admin/bookings/booking-1/proof-summary');
});
