import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn().mockResolvedValue({
  data: {
    data: {
      summaries: [],
      published: [{
        id: 'publication-event-1',
        targetId: 'publication-target-1',
        consentType: 'privacy_policy',
        version: 'v4',
        effectiveAt: '2026-09-04T00:00:00.000Z',
        changeSummary: 'Approved the updated privacy processing explanation for customers.',
        material: false,
        publishedBy: 'admin-1',
        publishedByName: 'Ava Santos',
        publishedByEmail: 'ava@onservice.test',
        publishedAt: '2026-09-03T00:00:00.000Z',
      }],
      allowedConsentTypes: ['privacy_policy'],
    },
  },
}));

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));

import ConsentVersionsPage from '../ConsentVersionsPage';

it('Bug UX-1301 - consent history identifies the publisher by name and email while retaining the audit ID', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={['/consent-versions?tab=history']}>
      <QueryClientProvider client={client}><ConsentVersionsPage /></QueryClientProvider>
    </MemoryRouter>,
  );

  expect(await screen.findByRole('tab', { name: 'Audit trail', selected: true })).toBeVisible();
  expect((await screen.findAllByText('Ava Santos')).length).toBeGreaterThan(0);
  expect((await screen.findAllByText('ava@onservice.test')).length).toBeGreaterThan(0);
  expect((await screen.findAllByTitle('Publisher ID: admin-1')).length).toBeGreaterThan(0);
});
