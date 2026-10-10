import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet }, getErrorMessage: (error: unknown) => String(error) }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import ProjectsPage from '../ProjectsPage';

it('Bug UX-908 — Admin opens a private project image through authenticated access and a blob instead of a raw storage URL', async () => {
  const blob = new Blob(['private-image'], { type: 'image/jpeg' });
  apiGet.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/projects') return { data: { success: true, data: [{
      id: 'project-908', customerId: 'customer-908', providerId: null, customerName: 'Maria Santos', providerName: null,
      title: 'Private plan', description: '', city: 'Cebu City', status: 'planning', estimatedTotal: null, createdAt: '2026-09-01',
    }], summary: { totalProjects: 1, activeProjects: 0, legacyProviderLinks: 0 }, pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } } };
    if (url === '/api/v1/projects/project-908') return { data: { success: true, data: {
      id: 'project-908', customerId: 'customer-908', providerId: null, customerName: 'Maria Santos', providerName: null,
      title: 'Private plan', description: '', city: 'Cebu City', status: 'planning', estimatedTotal: null, createdAt: '2026-09-01',
      milestones: [], selections: [], documents: [{ id: 'document-908', label: 'Permit image', fileUrl: null, accessPath: '/api/v1/projects/documents/document-908/access', docType: 'permit' }],
    } } };
    if (url === '/api/v1/projects/documents/document-908/access') return { data: { success: true, data: { url: '/api/v1/projects/documents/document-908/file?expires=123&token=signed' } } };
    if (url.includes('/api/v1/projects/documents/document-908/file')) return { data: blob };
    throw new Error(`Unexpected request: ${url}`);
  });
  const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:private-project-document');
  const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><ProjectsPage /></MemoryRouter></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Review milestones, choices, and documents' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Permit image Permit' }));

  await waitFor(() => expect(apiGet).toHaveBeenCalledWith(
    '/api/v1/projects/documents/document-908/access',
  ));
  expect(apiGet).toHaveBeenCalledWith(
    '/api/v1/projects/documents/document-908/file?expires=123&token=signed',
    { responseType: 'blob' },
  );
  expect(createObjectUrl).toHaveBeenCalledWith(blob);
  expect(await screen.findByRole('img', { name: 'Private planning image: Permit image' })).toHaveAttribute(
    'src',
    'blob:private-project-document',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
  expect(screen.queryByRole('img', { name: 'Private planning image: Permit image' })).not.toBeInTheDocument();
  expect(revokeObjectUrl).toHaveBeenCalledWith('blob:private-project-document');
  createObjectUrl.mockRestore();
  revokeObjectUrl.mockRestore();
});
