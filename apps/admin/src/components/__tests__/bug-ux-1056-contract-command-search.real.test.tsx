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

it('Bug UX-1056 - command search identifies a contract and preserves its exact Business Account 360 context', async () => {
  vi.useFakeTimers();
  testState.get.mockResolvedValueOnce({ data: { data: [{
    kind: 'contract',
    id: '22222222-2222-4222-8222-222222222222',
    title: 'Contract 22222222',
    subtitle: 'Cebu Build Co · Post-construction cleaning · draft',
    status: 'draft',
    to: '/business-accounts/11111111-1111-4111-8111-111111111111?tab=contracts&contractId=22222222-2222-4222-8222-222222222222',
  }] } });

  render(<MemoryRouter><Header /></MemoryRouter>);
  const search = screen.getByRole('textbox', { name: 'Search admin pages and records' });
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: '22222222' } });

  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });

  const result = screen.getByRole('button', { name: 'Open Contract Contract 22222222' });
  expect(screen.getByText('Post-construction cleaning', { exact: false })).toBeVisible();
  fireEvent.click(result);
  expect(testState.navigate).toHaveBeenCalledWith(
    '/business-accounts/11111111-1111-4111-8111-111111111111?tab=contracts&contractId=22222222-2222-4222-8222-222222222222',
  );
});
