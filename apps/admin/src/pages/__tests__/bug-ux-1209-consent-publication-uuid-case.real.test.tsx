import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const PUBLICATION_ID = '12090000-abcd-4abc-8def-000000001209';
const EVENT_ID = '12090000-abcd-4abc-8def-000000009999';
const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import ConsentVersionsPage from '../ConsentVersionsPage';

it('Bug UX-1209 - an uppercase consent-publication UUID loads the canonical evidence record', async () => {
  apiMocks.get.mockImplementation((url: string) => {
    if (url === `/api/v1/admin/compliance/consent-versions/${PUBLICATION_ID}`) {
      return Promise.resolve({ data: { data: {
        id: EVENT_ID,
        targetId: PUBLICATION_ID,
        consentType: 'privacy_policy',
        version: '4.0',
        effectiveAt: '2026-09-10T00:00:00.000Z',
        changeSummary: 'Canonical publication evidence for the scheduled policy version.',
        material: true,
        publishedBy: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        publishedAt: '2026-09-04T00:00:00.000Z',
      } } });
    }
    if (url === '/api/v1/admin/compliance/consent-versions') {
      return Promise.resolve({ data: { data: {
        summaries: [],
        published: [],
        allowedConsentTypes: ['privacy_policy'],
      } } });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/consent-versions?tab=history&publicationId=${PUBLICATION_ID.toUpperCase()}`]}>
        <ConsentVersionsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('heading', { name: /privacy policy.*Version 4\.0/ })).toBeVisible();
  expect(screen.getByText(PUBLICATION_ID)).toBeVisible();
  expect(apiMocks.get).toHaveBeenCalledWith(
    `/api/v1/admin/compliance/consent-versions/${PUBLICATION_ID}`,
  );
});
