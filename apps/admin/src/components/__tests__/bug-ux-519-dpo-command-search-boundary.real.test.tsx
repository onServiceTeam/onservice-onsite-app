import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const testState = vi.hoisted(() => ({
  get: vi.fn(),
  auth: {
    user: {
      id: 'dpo-1', email: 'dpo@example.test', phone: '+639000000001',
      firstName: 'Privacy', lastName: 'Officer', role: 'dpo' as const, avatarUrl: null,
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

import Header from '../Header';

afterEach(() => {
  vi.useRealTimers();
  testState.get.mockReset();
});

it('Bug UX-519 — DPO command search stays privacy-page-only and explains the active access boundary', async () => {
  vi.useFakeTimers();
  render(<MemoryRouter><Header /></MemoryRouter>);
  const search = screen.getByRole('textbox', { name: 'Search admin pages and records' });
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: 'Ana Reyes' } });

  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });

  expect(testState.get).not.toHaveBeenCalled();
  expect(screen.getByText(/Page search only for the privacy role.*outside DPO access/i)).toBeVisible();
  expect(screen.queryByRole('region', { name: 'Matching operational records' })).toBeNull();
});
