import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Schedule from '../app/provider/schedule';

type Day = { dayOfWeek: number; startTime: string; endTime: string; isAvailable: boolean };
let mockSaved: Day[] = [{ dayOfWeek: 3, startTime: '09:00', endTime: '17:00', isAvailable: true }];
let mockFinish: (() => void) | undefined;
const mockSet = jest.fn((days: Day[]) => new Promise<void>(resolve => {
  mockFinish = () => { mockSaved = days; resolve(); };
}));
jest.mock('@/services/provider-api.service', () => ({
  getMySchedule: () => Promise.resolve(mockSaved), setMySchedule: (...args: [Day[]]) => mockSet(...args),
}));

it('Bug UX-1353 — completing an earlier weekly save does not discard or mark a later edit as saved', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><Schedule /></QueryClientProvider>);
  await screen.findByDisplayValue('09:00');
  fireEvent.change(screen.getByLabelText('Wednesday start time in HH:MM'), { target: { value: '10:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Schedule' }));
  await waitFor(() => expect(mockSet).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByLabelText('Wednesday start time in HH:MM'), { target: { value: '12:00' } });
  await act(async () => { mockFinish!(); });
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Saving...' })).toBeNull());
  expect((screen.getByLabelText('Wednesday start time in HH:MM') as HTMLInputElement).value).toBe('12:00');
  expect((screen.getByRole('button', { name: 'Save Schedule' }) as HTMLButtonElement).disabled).toBe(false);
  expect(mockSaved.find(day => day.dayOfWeek === 3)?.startTime).toBe('10:00');
  fireEvent.click(screen.getByRole('button', { name: 'Save Schedule' }));
  await waitFor(() => expect(mockSet).toHaveBeenCalledTimes(2));
  await act(async () => { mockFinish!(); });
  await waitFor(() => expect((screen.getByRole('button', { name: 'Save Schedule' }) as HTMLButtonElement).disabled).toBe(true));
  expect(mockSaved.find(day => day.dayOfWeek === 3)?.startTime).toBe('12:00');
  view.unmount(); client.clear();
});
