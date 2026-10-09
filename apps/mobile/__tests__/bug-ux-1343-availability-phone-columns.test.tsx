import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Availability from '../app/provider/availability';

let mockIsPhone = true;
jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isPhone: mockIsPhone }) }));
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return { ...actual, View: ({ style, ...props }: { style?: object; children?: React.ReactNode }) =>
    <actual.View {...props} style={actual.StyleSheet.flatten(style)} /> };
});
jest.mock('@/services/provider-api.service', () => ({
  getAvailabilityOverrides: jest.fn().mockResolvedValue([]), getAvailabilityStatus: jest.fn().mockResolvedValue(false),
  addAvailabilityOverride: jest.fn(), removeAvailabilityOverride: jest.fn(), toggleAvailability: jest.fn(),
}));

it('Bug UX-1343 — phone availability columns can shrink while wide screens retain their two-column minimums', async () => {
  for (const phone of [true, false]) {
    mockIsPhone = phone;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const view = render(<QueryClientProvider client={client}><Availability /></QueryClientProvider>);
    const workspace = await screen.findByLabelText(phone ? 'Availability settings' : 'Tablet and desktop availability workspace');
    expect(workspace.childElementCount).toBe(2);
    const columns = Array.from(workspace.children);
    expect(columns[0]?.getAttribute('style')).toContain(phone ? 'min-width: 0' : 'min-width: 250px');
    expect(columns[1]?.getAttribute('style')).toContain(phone ? 'min-width: 0' : 'min-width: 360px');
    fireEvent.click(screen.getByText('+ Add', { exact: true }));
    expect(screen.getByLabelText('Override date in YYYY-MM-DD format')).toBeTruthy();
    expect(screen.getByLabelText('Override reason')).toBeTruthy();
    view.unmount(); client.clear();
  }
});
