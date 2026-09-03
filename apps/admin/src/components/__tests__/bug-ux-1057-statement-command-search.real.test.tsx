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

it('Bug UX-1057 - command search opens the exact commercial statement without exposing its payment reference', async () => {
  vi.useFakeTimers();
  testState.get.mockResolvedValueOnce({ data: { data: [{
    kind: 'statement',
    id: '33333333-3333-4333-8333-333333333333',
    title: 'STMT-2026-0903',
    subtitle: 'Cebu Build Co · Aug 2026 · sent',
    status: 'sent',
    to: '/business-accounts/11111111-1111-4111-8111-111111111111?tab=invoices&invoiceId=33333333-3333-4333-8333-333333333333',
  }] } });

  render(<MemoryRouter><Header /></MemoryRouter>);
  const search = screen.getByRole('textbox', { name: 'Search admin pages and records' });
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: 'BANK-PRIVATE-REFERENCE-394' } });

  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });

  expect(screen.queryByText('BANK-PRIVATE-REFERENCE-394')).toBeNull();
  const result = screen.getByRole('button', { name: 'Open Statement STMT-2026-0903' });
  fireEvent.click(result);
  expect(testState.navigate).toHaveBeenCalledWith(
    '/business-accounts/11111111-1111-4111-8111-111111111111?tab=invoices&invoiceId=33333333-3333-4333-8333-333333333333',
  );
});
