import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const testState = vi.hoisted(() => ({
  get: vi.fn(),
  navigate: vi.fn(),
  auth: {
    user: {
      id: 'dpo-1', email: 'dpo@example.test', phone: '+639000000001',
      firstName: 'Privacy', lastName: 'Officer', role: 'dpo' as const, avatarUrl: null,
    },
    logout: vi.fn(),
  },
}));

vi.mock('@/lib/api', () => ({ default: { get: testState.get } }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return { ...actual, useNavigate: () => testState.navigate };
});
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector?: (state: typeof testState.auth) => unknown) => (
    selector ? selector(testState.auth) : testState.auth
  ),
}));

import Header from '../Header';

it('Bug UX-568 — DPO header deadline control opens privacy work instead of operations alerts', () => {
  render(<MemoryRouter><Header /></MemoryRouter>);

  fireEvent.click(screen.getByRole('button', { name: 'View privacy deadlines' }));

  expect(testState.navigate).toHaveBeenCalledWith('/privacy');
  expect(screen.queryByRole('button', { name: 'View operational alerts' })).toBeNull();
});
