import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';

import { OverviewTab, type BookingDetail } from '../BookingDetailPage';

it('Bug UX-480 — Booking 360 shows whichever service-address fields exist instead of treating a partial address as missing', () => {
  const detail: BookingDetail = {
    id: 'booking-1', status: 'requested', escrowStatus: 'pending', scheduledAt: null,
    completedAt: null, confirmedAt: null, cancelledAt: null, cancellationReason: null,
    pricingMode: 'fixed_price', servicePrice: 10000, serviceFee: 0, totalAmount: 10000,
    conversationId: null, category: null, subcategory: null,
    address: { full: '', barangay: 'Lahug', city: '', province: '' },
    customer: null, provider: null, businessContext: null,
    createdAt: '2026-08-30T01:00:00.000Z',
  };

  render(<MemoryRouter><OverviewTab detail={detail} /></MemoryRouter>);

  expect(screen.getByText('Lahug')).toBeVisible();
  expect(screen.queryByText('No address on file.')).not.toBeInTheDocument();
});
