import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const testState = vi.hoisted(() => ({
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

import Header from '../Header';

afterEach(() => {
  vi.useRealTimers();
  testState.get.mockReset();
});

it('Bug UX-1291 - command search keeps malformed record data from crashing the operator header', async () => {
  vi.useFakeTimers();
  testState.get.mockResolvedValueOnce({
    data: {
      data: [{
        kind: 'future_record_kind',
        id: 'record-1',
        title: 'Unexpected record',
        subtitle: 'This shape is not supported by this client',
        status: 'open',
        to: '/future-records/record-1',
      }],
    },
  });

  render(<MemoryRouter><Header /></MemoryRouter>);
  const search = screen.getByRole('textbox', { name: 'Search admin pages and records' });
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: 'unexpected record' } });

  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });

  expect(testState.get).toHaveBeenCalledWith('/api/v1/admin/search', expect.objectContaining({
    params: { q: 'unexpected record' },
  }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Record search returned unusable results. Page shortcuts still work.',
  );
  expect(screen.queryByText('Unexpected record')).toBeNull();
});
