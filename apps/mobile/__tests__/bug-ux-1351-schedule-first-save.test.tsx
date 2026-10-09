import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Schedule from '../app/provider/schedule';

type SavedDay = { dayOfWeek: number; startTime: string; endTime: string; isAvailable: boolean };
let mockSaved: SavedDay[] = [];
const mockSet = jest.fn(async (days: SavedDay[]) => { mockSaved = days; });
jest.mock('@/services/provider-api.service', () => ({
  getMySchedule: () => Promise.resolve(mockSaved), setMySchedule: (...args: [SavedDay[]]) => mockSet(...args),
}));

it('Bug UX-1351 — a new provider can explicitly save suggested weekly hours without making a dummy edit', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><Schedule /></QueryClientProvider>);
  const save = await screen.findByRole('button', { name: 'Save Schedule' });
  expect(screen.getByText('Suggested hours are not saved yet. Review them, then Save Schedule to set your weekly hours.')).toBeTruthy();
  expect((save as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(save);
  await waitFor(() => expect(mockSet).toHaveBeenCalledTimes(1));
  expect(mockSaved).toHaveLength(7);
  expect(mockSaved.filter(day => day.isAvailable).map(day => day.dayOfWeek)).toEqual([1, 2, 3, 4, 5]);
  await waitFor(() => expect(screen.queryByText(/Suggested hours are not saved yet/)).toBeNull());
  expect((screen.getByRole('button', { name: 'Save Schedule' }) as HTMLButtonElement).disabled).toBe(true);
  view.unmount(); client.clear();
});
