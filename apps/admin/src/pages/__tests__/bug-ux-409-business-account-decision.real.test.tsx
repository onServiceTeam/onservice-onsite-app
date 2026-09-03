import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import api from '@/lib/api';
import BusinessAccountsPage from '../BusinessAccountsPage';

describe('business-account approval', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset().mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 'business-1',
            companyName: 'Cebu Build Co',
            businessType: 'other',
            city: 'Cebu City',
            province: 'Cebu',
            contactPerson: 'Site Manager',
            contactEmail: 'manager@example.test',
            contactPhone: '+630000000000',
            status: 'pending',
            paymentTerms: 'net_30',
            volumeDiscountRate: 5,
            monthlyCreditLimit: 500000,
            ownerName: 'Account Owner',
            managerName: 'Operations Admin',
            createdAt: '2026-08-25T00:00:00.000Z',
          },
        ],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
    } as never);
    vi.mocked(api.post).mockReset().mockResolvedValue({ data: { success: true } } as never);
  });

  it('Bug UX-409 — the business list routes approval to Account 360 instead of exposing a blind money decision', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <BusinessAccountsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const reviewLink = await screen.findByRole('link', { name: 'Review business account Cebu Build Co' });
    expect(reviewLink).toHaveAttribute('href', '/business-accounts/business-1');
    expect(screen.queryByRole('button', { name: /Approve business account/i })).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });
});
