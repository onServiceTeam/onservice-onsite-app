import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';

import { OverviewTab, type BookingDetail } from '../BookingDetailPage';

it('Bug UX-1053 - Booking 360 links every governing business record without hiding historical statements', () => {
  const detail: BookingDetail = {
    id: 'booking-1', status: 'confirmed', escrowStatus: null, scheduledAt: null,
    completedAt: null, confirmedAt: null, cancelledAt: null, cancellationReason: null,
    pricingMode: 'fixed_price', servicePrice: 10000, serviceFee: 1000, totalAmount: 11000,
    conversationId: null, category: null, subcategory: null, address: null,
    customer: null, provider: null, createdAt: '2026-09-03T00:00:00.000Z',
    businessContext: {
      billingMode: 'business_terms', linkageState: 'complete', linkageIssues: [],
      account: {
        id: '11111111-1111-4111-8111-111111111111',
        companyName: 'Cebu Build Co', status: 'active',
      },
      contract: {
        id: '22222222-2222-4222-8222-222222222222',
        businessAccountId: '11111111-1111-4111-8111-111111111111',
        contractType: 'recurring', frequency: 'monthly', status: 'active',
      },
      termsVersion: {
        id: '33333333-3333-4333-8333-333333333333',
        businessAccountId: '11111111-1111-4111-8111-111111111111',
        version: 4, effectiveFrom: '2026-09-01T00:00:00.000Z',
      },
      statements: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          businessAccountId: '11111111-1111-4111-8111-111111111111',
          number: 'BS-2026-0042', status: 'sent', settlementState: 'open',
        },
        {
          id: '55555555-5555-4555-8555-555555555555',
          businessAccountId: '11111111-1111-4111-8111-111111111111',
          number: 'BS-2026-0037', status: 'void', settlementState: 'void',
        },
      ],
    },
  };

  render(<MemoryRouter><OverviewTab detail={detail} /></MemoryRouter>);

  expect(screen.getByRole('link', { name: 'Cebu Build Co' })).toHaveAttribute(
    'href', '/business-accounts/11111111-1111-4111-8111-111111111111',
  );
  expect(screen.getByRole('link', { name: 'Contract 22222222' })).toHaveAttribute(
    'href', '/business-accounts/11111111-1111-4111-8111-111111111111?tab=contracts',
  );
  expect(screen.getByRole('link', { name: 'BS-2026-0042' })).toHaveAttribute(
    'href', '/business-accounts/11111111-1111-4111-8111-111111111111?tab=invoices&invoiceId=44444444-4444-4444-8444-444444444444',
  );
  expect(screen.getByRole('link', { name: 'BS-2026-0037' })).toBeVisible();
  expect(screen.getByText('Version 4')).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
