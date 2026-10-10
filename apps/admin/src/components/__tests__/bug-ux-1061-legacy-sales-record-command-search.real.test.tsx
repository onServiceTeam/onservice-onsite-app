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

it('Bug UX-1061 - command search opens a retained record with explicit legacy labeling', async () => {
  vi.useFakeTimers();
  testState.get.mockResolvedValueOnce({ data: { data: [{
    kind: 'legacy_sales_record',
    id: '39800000-0000-4000-8000-000000000398',
    title: 'Legacy record OR-2026-09-000398',
    subtitle: 'Booking 39800000 · Legacy Customer · retained for review',
    status: 'retained for review',
    to: '/financials?tab=receipts&receiptOr=OR-2026-09-000398',
  }] } });

  render(<MemoryRouter><Header /></MemoryRouter>);
  const search = screen.getByRole('textbox', { name: 'Search admin pages and records' });
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: 'OR-2026-09-000398' } });

  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });

  expect(screen.getByText('Legacy sales record')).toBeVisible();
  const result = screen.getByRole('button', {
    name: 'Open Legacy sales record Legacy record OR-2026-09-000398',
  });
  fireEvent.click(result);
  expect(testState.navigate).toHaveBeenCalledWith(
    '/financials?tab=receipts&receiptOr=OR-2026-09-000398',
  );
});
