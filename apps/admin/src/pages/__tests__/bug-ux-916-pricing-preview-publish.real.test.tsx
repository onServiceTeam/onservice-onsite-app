import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: (error: Error) => error.message }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import PricingRulesPage from '../PricingRulesPage';

it('Bug UX-916 — a super-admin reviews server totals, overlap, and a zero platform share before explicit publication', async () => {
  const rule = {
    id: 'rule-916', name: 'Christmas provider coverage', type: 'holiday', multiplier: 1.5,
    rushHoursThreshold: null, holidayDate: '2026-12-25', peakStartTime: null, peakEndTime: null,
    peakDaysOfWeek: null, categoryId: 'category-916', serviceAreaId: 'area-916', isActive: false,
    publicationStatus: 'draft', priority: 20, platformSurgeShare: 0, description: '',
    createdAt: '2026-09-02T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z',
    publishReason: null, publishedAt: null, retireReason: null, retiredAt: null,
  };
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/pricing-rules') return { data: {
      success: true, data: [rule], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    } };
    if (url === '/api/v1/catalog/admin/full') return { data: { success: true, data: [{
      id: 'category-916', name: 'Cleaning', subcategories: [{
        id: 'subcategory-916', name: 'Deep clean', pricingType: 'fixed', basePrice: 100000, isActive: true,
      }],
    }] } };
    if (url === '/api/v1/admin/service-areas') return { data: {
      success: true,
      data: [{ id: 'area-916', name: 'Metro Cebu', city: 'Cebu City', province: 'Cebu', status: 'active' }],
      pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
    } };
    throw new Error(`Unexpected request: ${url}`);
  });
  apiMocks.post.mockImplementation(async (url: string) => {
    if (url.endsWith('/preview')) return { data: { success: true, data: {
      id: 'preview-916', ruleId: rule.id, createdAt: '2026-09-02T00:00:00Z', expiresAt: '2026-12-25T11:30:00Z',
      results: [{
        subcategory: { id: 'subcategory-916', name: 'Deep clean', categoryId: 'category-916', categoryName: 'Cleaning' },
        serviceArea: { id: 'area-916', name: 'Metro Cebu', city: 'Cebu City', province: 'Cebu' },
        scheduledAt: '2026-12-25T04:00:00Z', basePrice: 100000, surgeMultiplier: 1.5,
        surgeAmount: 50000, finalPrice: 150000, platformSurgeShare: 0, providerSurgeShare: 50000,
        winningRule: { id: rule.id, name: rule.name, type: rule.type, multiplier: 1.5, isDraft: true },
        matchingRules: [
          { id: rule.id, name: rule.name, type: rule.type, multiplier: 1.5, priority: 20, isDraft: true },
          { id: 'existing-916', name: 'Existing holiday', type: 'holiday', multiplier: 1.2, priority: 10, isDraft: false },
        ],
      }],
    } } };
    if (url.endsWith('/publish')) return { data: { success: true, data: { ...rule, publicationStatus: 'published' } } };
    throw new Error(`Unexpected mutation: ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><PricingRulesPage /></MemoryRouter></QueryClientProvider>);

  fireEvent.click((await screen.findAllByRole('button', { name: 'Preview & publish' }))[0]!);
  fireEvent.click(screen.getByRole('button', { name: 'Run server preview' }));

  expect(await screen.findByText('Current server preview')).toBeVisible();
  expect(screen.getByText('₱1,500.00')).toBeVisible();
  expect(screen.getByText(/Existing holiday \(P10\)/)).toBeVisible();
  expect(screen.getAllByText('₱0.00')[0]).toBeVisible();
  fireEvent.change(screen.getByLabelText('Publication reason'), {
    target: { value: 'Publishing after checking the customer and provider allocation.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Publish for future bookings' }));

  await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/api/v1/admin/pricing-rules/rule-916/publish', {
    previewId: 'preview-916',
    reason: 'Publishing after checking the customer and provider allocation.',
  }));
});
