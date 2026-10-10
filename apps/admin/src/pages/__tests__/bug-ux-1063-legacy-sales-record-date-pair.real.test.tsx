import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import api from '@/lib/api';
import { ReceiptsPanel } from '../FinancialsPage';

it('Bug UX-1063 - legacy sales-record search requires both date boundaries before calling the API', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ReceiptsPanel /></QueryClientProvider>);

  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));

  expect(screen.getByText('Choose both a receipt search start date and end date.')).toHaveAttribute(
    'role',
    'alert',
  );
  expect(api.get).not.toHaveBeenCalled();
});
