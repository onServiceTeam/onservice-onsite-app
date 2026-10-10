import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import Schedule from '../app/provider/schedule';

let mockSaved = [{ dayOfWeek: 3, startTime: '09:00', endTime: '17:00', isAvailable: true }];
const mockSet = jest.fn().mockResolvedValue(undefined);
jest.mock('@/services/provider-api.service', () => ({
  getMySchedule: () => Promise.resolve(mockSaved), setMySchedule: (...args: unknown[]) => mockSet(...args),
}));

function SavedHoursProbe(): React.ReactElement {
  const { data } = useQuery({ queryKey: ['providerSchedule'], queryFn: () => Promise.resolve(mockSaved) });
  return <output data-testid="saved-hours">{data?.[0]?.startTime}</output>;
}

it('Bug UX-1352 — refreshing saved hours cannot replace an unsaved weekly schedule edit', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><Schedule /><SavedHoursProbe /></QueryClientProvider>);
  await screen.findByDisplayValue('09:00');
  fireEvent.change(screen.getByLabelText('Wednesday start time in HH:MM'), { target: { value: '10:00' } });
  await act(async () => {
    mockSaved = [{ ...mockSaved[0]!, startTime: '11:00' }];
    await client.refetchQueries({ queryKey: ['providerSchedule'] });
  });
  // Wait for a real observer to render the new server value, not just for the
  // fetch promise. The local draft must survive React processing that update.
  await waitFor(() => expect(screen.getByTestId('saved-hours').textContent).toBe('11:00'));
  expect((screen.getByLabelText('Wednesday start time in HH:MM') as HTMLInputElement).value).toBe('10:00');
  fireEvent.click(screen.getByRole('button', { name: 'Save Schedule' }));
  await waitFor(() => expect(mockSet).toHaveBeenCalledTimes(1));
  expect(mockSet).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ dayOfWeek: 3, startTime: '10:00' })]));
  view.unmount(); client.clear();
});
