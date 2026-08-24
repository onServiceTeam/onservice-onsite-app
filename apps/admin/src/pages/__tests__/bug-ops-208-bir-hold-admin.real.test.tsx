import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));

import { BirReportsPanel } from '../FinancialsPage';

describe('admin BIR compliance hold', () => {
  it('Bug OPS-208 — staff see workpaper warnings and cannot generate held BIR documents', async () => {
    apiMocks.get.mockResolvedValueOnce({
      data: {
        data: {
          year: 2026,
          totalOutputVat: 1200,
          totalVatPayable: 1200,
          monthsFinalized: 0,
          monthlyReports: [{
            month: 1,
            outputVat: 1200,
            vatPayable: 1200,
            finalized: false,
            pdfUrl: null,
          }],
          quarterlyBatches: [{ quarter: 1, batchCount: 0, totalWithheld: 0 }],
        },
      },
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <BirReportsPanel isSuperAdmin />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/compliance hold \(E22\)/i);
    expect(screen.getByRole('heading', { name: /internal monthly VAT reconciliation/i })).toBeVisible();
    for (const button of screen.getAllByRole('button', { name: /generate|lock/i })) {
      expect(button).toBeDisabled();
    }
    expect(screen.queryByText('Monthly VAT Reports')).not.toBeInTheDocument();
    expect(apiMocks.post).not.toHaveBeenCalled();
  });
});
