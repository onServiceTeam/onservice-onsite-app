import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Schedule from '../app/provider/schedule';

const mockSet = jest.fn().mockResolvedValue(undefined);
jest.mock('@/services/provider-api.service', () => ({
  getMySchedule: jest.fn().mockResolvedValue([{ id: 'saved', dayOfWeek: 3, startTime: '09:00', endTime: '17:00', isAvailable: true }]),
  setMySchedule: (...args: unknown[]) => mockSet(...args),
}));

it('Bug UX-1350 — editing a partial saved week does not silently open days absent from the saved schedule', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><Schedule /></QueryClientProvider>);
  await screen.findByDisplayValue('09:00');
  for (const day of ['Sunday', 'Monday', 'Tuesday', 'Thursday', 'Friday', 'Saturday']) {
    expect(screen.queryByLabelText(`${day} start time in HH:MM`)).toBeNull();
  }
  fireEvent.change(screen.getByLabelText('Wednesday start time in HH:MM'), { target: { value: '10:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Schedule' }));
  await waitFor(() => expect(mockSet).toHaveBeenCalledTimes(1));
  const submitted = mockSet.mock.calls[0]![0] as { dayOfWeek: number; isAvailable: boolean; startTime: string }[];
  expect(submitted).toHaveLength(7);
  expect(submitted.filter(day => day.isAvailable)).toEqual([expect.objectContaining({ dayOfWeek: 3, startTime: '10:00' })]);
  view.unmount(); client.clear();
});
