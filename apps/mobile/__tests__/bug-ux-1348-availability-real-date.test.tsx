import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Availability from '../app/provider/availability';

const mockAdd = jest.fn().mockResolvedValue({ id: 'synthetic-override' });
const mockToast = jest.fn();
jest.mock('@/lib/toast', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));
jest.mock('@/services/provider-api.service', () => ({
  getAvailabilityOverrides: jest.fn().mockResolvedValue([]), getAvailabilityStatus: jest.fn().mockResolvedValue(false),
  addAvailabilityOverride: (...args: unknown[]) => mockAdd(...args), removeAvailabilityOverride: jest.fn(), toggleAvailability: jest.fn(),
}));

it('Bug UX-1348 — the override form rejects impossible dates locally and submits a corrected valid leap day once', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><Availability /></QueryClientProvider>);
  fireEvent.click(await screen.findByText('+ Add', { exact: true }));
  const date = screen.getByLabelText('Override date in YYYY-MM-DD format');
  for (const value of ['2099-02-29', '2100-02-29', '2099-04-31', '2099-13-01']) {
    mockToast.mockClear();
    fireEvent.change(date, { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mockToast).toHaveBeenCalledWith('Enter a real calendar date in YYYY-MM-DD format.', 'warning');
    expect(mockAdd).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue(value)).toBe(date);
  }
  fireEvent.change(date, { target: { value: '2104-02-29' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(mockAdd).toHaveBeenCalledTimes(1));
  expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({ overrideDate: '2104-02-29', isAvailable: false }));
  view.unmount(); client.clear();
});
