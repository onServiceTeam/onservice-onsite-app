import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const testState = vi.hoisted(() => ({
  navigate: vi.fn(),
  get: vi.fn(),
  auth: {
    user: {
      id: 'admin-1', email: 'ops@example.test', phone: '+639000000000',
      firstName: 'Operations', lastName: 'Admin', role: 'admin' as const, avatarUrl: null,
    },
    logout: vi.fn(),
  },
}));

vi.mock('@/lib/api', () => ({ default: { get: testState.get } }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector?: (state: typeof testState.auth) => unknown) => (
    selector ? selector(testState.auth) : testState.auth
  ),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return { ...actual, useNavigate: () => testState.navigate };
});

import Header from '../Header';

afterEach(() => {
  vi.useRealTimers();
  testState.get.mockReset();
  testState.navigate.mockReset();
});

it('Bug UX-1059 - command search opens the exact payment attempt without exposing its gateway identifier', async () => {
  vi.useFakeTimers();
  testState.get.mockResolvedValueOnce({ data: { data: [{
    kind: 'payment',
    id: '39700000-0000-4000-8000-000000000397',
    title: 'Payment 39700000',
    subtitle: 'Booking 39700000 · Payment Customer · GCASH · succeeded',
    status: 'succeeded',
    to: '/financials?tab=payments&intentSearch=39700000-0000-4000-8000-000000000397',
  }] } });

  render(<MemoryRouter><Header /></MemoryRouter>);
  const search = screen.getByRole('textbox', { name: 'Search admin pages and records' });
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: 'pi_private_ux_1059' } });

  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });

  expect(screen.queryByText('pi_private_ux_1059')).toBeNull();
  const result = screen.getByRole('button', { name: 'Open Payment Payment 39700000' });
  fireEvent.click(result);
  expect(testState.navigate).toHaveBeenCalledWith(
    '/financials?tab=payments&intentSearch=39700000-0000-4000-8000-000000000397',
  );
});
