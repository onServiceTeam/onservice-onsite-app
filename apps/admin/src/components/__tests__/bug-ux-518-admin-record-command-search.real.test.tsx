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

it('Bug UX-518 — command search renders masked cross-entity results and opens the canonical case', async () => {
  vi.useFakeTimers();
  testState.get.mockResolvedValueOnce({ data: { data: [{
    kind: 'support',
    id: '44444444-4444-4444-8444-444444444444',
    title: 'SUP-1044',
    subtitle: 'Provider is late · A•••@example.com · open',
    status: 'open',
    to: '/support-tickets?ticketId=44444444-4444-4444-8444-444444444444',
  }] } });

  render(<MemoryRouter><Header /></MemoryRouter>);
  const search = screen.getByRole('textbox', { name: 'Search admin pages and records' });
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: 'SUP-1044' } });

  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });

  expect(testState.get).toHaveBeenCalledWith('/api/v1/admin/search', expect.objectContaining({
    params: { q: 'SUP-1044' },
  }));
  expect(screen.getByText('A•••@example.com', { exact: false })).toBeVisible();
  const result = screen.getByRole('button', { name: 'Open Support SUP-1044' });
  fireEvent.click(result);
  expect(testState.navigate).toHaveBeenCalledWith('/support-tickets?ticketId=44444444-4444-4444-8444-444444444444');
});
