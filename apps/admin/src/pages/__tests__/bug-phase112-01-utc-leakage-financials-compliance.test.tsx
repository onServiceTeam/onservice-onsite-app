import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

import AuditLogPage from '../AuditLogPage';
import FinancialsPage from '../FinancialsPage';

function renderWithClient(child: React.ReactElement): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{child}</QueryClientProvider>);
}

it('BUG-PHASE112-01 — Manila midnight drives the visible financial date and downloaded audit filename', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-06T16:30:00.000Z'));
  const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:audit-export');
  const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  let downloadedName = '';
  const anchorClick = vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(function captureDownload(this: { download: string }) {
    downloadedName = this.download;
  });

  try {
    const financials = renderWithClient(<FinancialsPage />);
    expect(screen.getByLabelText('To')).toHaveValue('2026-05-07');
    financials.unmount();

    renderWithClient(<AuditLogPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Export filtered CSV' }));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(downloadedName).toBe('audit-log-2026-05-07.csv');
  } finally {
    anchorClick.mockRestore();
    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
    vi.useRealTimers();
  }
});
