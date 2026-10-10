import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Availability from '../app/provider/availability';

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return { ...actual, TextInput: ({ style, ...props }: { style?: object }) =>
    <actual.TextInput {...props} style={actual.StyleSheet.flatten(style)} /> };
});
jest.mock('@/services/provider-api.service', () => ({
  getAvailabilityOverrides: jest.fn().mockResolvedValue([]), getAvailabilityStatus: jest.fn().mockResolvedValue(false),
  addAvailabilityOverride: jest.fn(), removeAvailabilityOverride: jest.fn(), toggleAvailability: jest.fn(),
}));

it('Bug UX-1346 — custom-hours inputs can shrink below browser intrinsic width and retain both entered times', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><Availability /></QueryClientProvider>);
  fireEvent.click(await screen.findByText('+ Add', { exact: true }));
  fireEvent.click(screen.getByText('Available Hours for This Date', { exact: true }));
  for (const [label, value] of [['Override start time in HH:MM', '08:00'], ['Override end time in HH:MM', '17:00']]) {
    const input = screen.getByLabelText(label!);
    expect(input.getAttribute('style')).toContain('min-width: 0');
    fireEvent.change(input, { target: { value } });
    expect(screen.getByDisplayValue(value!)).toBe(input);
  }
  view.unmount(); client.clear();
});
