import React from 'react';
import { render } from '@testing-library/react';

jest.mock('@/components/icons', () => ({
  AlertTriangle: () => null,
  Camera: () => null,
  CheckCircle2: () => null,
  ClipboardList: () => null,
  Shield: () => null,
}));

import ProofSummaryCard from '@/components/booking/ProofSummaryCard';
import type { BookingProofSummary } from '@/services/booking-proof.service';

const summary: BookingProofSummary = {
  booking: {
    id: 'booking-1',
    status: 'in_progress',
    description: 'Post-construction clean',
    workStartedAt: '2026-08-25T01:00:00.000Z',
    workCompletedAt: null,
    completedAt: null,
    confirmedAt: null,
    completionNotes: null,
  },
  readiness: {
    stage: 'in_progress',
    readyForProviderCompletion: false,
    minimumTimeOnSiteMinutes: 60,
    afterPhotosRequired: 2,
    blockers: [{ code: 'after_photos', message: 'Add one more provider completion photo.' }],
    qualityFlags: [],
  },
  checklist: {
    templateVersion: 1,
    shownAt: '2026-08-25T01:00:00.000Z',
    totalItems: 2,
    requiredItems: 2,
    completedRequiredItems: 1,
    complete: false,
    items: [
      {
        id: 'item-1',
        title: 'Remove construction dust',
        required: true,
        photoRequired: true,
        completed: true,
        completedAt: '2026-08-25T01:30:00.000Z',
        photoId: 'photo-1',
        notes: null,
      },
      {
        id: 'item-2',
        title: 'Final floor inspection',
        required: true,
        photoRequired: false,
        completed: false,
        completedAt: null,
        photoId: null,
        notes: null,
      },
    ],
  },
  photos: [
    {
      id: 'photo-1',
      photoType: 'after',
      uploadedByRole: 'provider',
      source: 'canonical',
      uploadedAt: '2026-08-25T01:30:00.000Z',
    },
    {
      id: 'photo-2',
      photoType: 'after',
      uploadedByRole: 'customer',
      source: 'canonical',
      uploadedAt: '2026-08-25T01:31:00.000Z',
    },
  ],
  signatures: {
    identityCaveat: 'Authenticated uploader is not verified signer identity.',
    records: [
      {
        id: 'signature-1',
        signatureType: 'customer_acceptance',
        signedByRole: 'provider',
        signedAt: '2026-08-25T01:45:00.000Z',
        attribution: 'Uploaded from provider session',
      },
    ],
  },
  changeOrders: [{ id: 'change-1', status: 'approved', photos: [] }],
  communications: { chatMessageCount: 3, supportTickets: [] },
  dispute: { id: 'dispute-1', type: 'quality_issue', status: 'open' },
};

it('Bug UX-309 — customer and provider see the same role-appropriate proof-to-close record', () => {
  const view = render(<ProofSummaryCard summary={summary} audience="customer" />);

  expect(view.getByText('Work record')).toBeTruthy();
  expect(view.getAllByText('1/2')).toHaveLength(2);
  expect(view.getByText('Add one more provider completion photo.')).toBeTruthy();
  expect(view.getByText('Remove construction dust')).toBeTruthy();
  expect(view.getByText(/Signature identity is still under review/)).toBeTruthy();
  expect(view.getByText('Dispute: quality issue · open')).toBeTruthy();

  view.rerender(<ProofSummaryCard summary={summary} audience="provider" />);

  expect(view.getByText('Proof to complete')).toBeTruthy();
  expect(view.getByText('Before you can submit completion')).toBeTruthy();
  expect(view.getByText(/customer and support team see this same booking proof/i)).toBeTruthy();
});
