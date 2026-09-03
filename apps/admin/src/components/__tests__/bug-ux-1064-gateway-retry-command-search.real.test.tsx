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

it('Bug UX-1064 - command search opens an unresolved gateway retry in payment operations', async () => {
  vi.useFakeTimers();
  testState.get.mockResolvedValueOnce({ data: { data: [{
    kind: 'gateway_retry',
    id: '39900000-0000-4000-8000-000000000399',
    title: 'Gateway retry 39900000',
    subtitle: 'Refund From Escrow · Booking 39900000 · failed permanent',
    status: 'failed_permanent',
    to: '/financials?tab=payments&retrySearch=39900000-0000-4000-8000-000000000399',
  }] } });

  render(<MemoryRouter><Header /></MemoryRouter>);
  const search = screen.getByRole('textbox', { name: 'Search admin pages and records' });
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: '39900000-0000-4000-8000-000000000399' } });

  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });

  expect(screen.getByText('Gateway retry')).toBeVisible();
  const result = screen.getByRole('button', { name: 'Open Gateway retry Gateway retry 39900000' });
  fireEvent.click(result);
  expect(testState.navigate).toHaveBeenCalledWith(
    '/financials?tab=payments&retrySearch=39900000-0000-4000-8000-000000000399',
  );
});
