import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Availability from '../app/provider/availability';

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return { ...actual, TouchableOpacity: ({ style, ...props }: { style?: object; children?: React.ReactNode }) =>
    <actual.TouchableOpacity {...props} style={actual.StyleSheet.flatten(style)} /> };
});
jest.mock('@/services/provider-api.service', () => ({
  getAvailabilityOverrides: jest.fn().mockResolvedValue([]), getAvailabilityStatus: jest.fn().mockResolvedValue(false),
  addAvailabilityOverride: jest.fn(), removeAvailabilityOverride: jest.fn(), toggleAvailability: jest.fn(),
}));

it('Bug UX-1345 — availability Cancel and Save share their row without each requesting its full width', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><Availability /></QueryClientProvider>);
  fireEvent.click(await screen.findByText('+ Add', { exact: true }));
  const cancel = screen.getByRole('button', { name: 'Cancel' });
  const save = screen.getByRole('button', { name: 'Save' });
  expect(cancel.getAttribute('style')).not.toContain('width: 100%');
  expect(save.getAttribute('style')).not.toContain('width: 100%');
  fireEvent.click(cancel);
  expect(screen.queryByLabelText('Override date in YYYY-MM-DD format')).toBeNull();
  view.unmount(); client.clear();
});
