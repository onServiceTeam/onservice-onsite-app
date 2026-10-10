import { it, expect, vi } from 'vitest';

vi.unmock('@/lib/api');

import api, { ApiError } from '../api';

it('Bug UX-1025 — the API wrapper routes a server password-rotation precondition to the required screen', async () => {
  const previousFetch = globalThis.fetch;
  const popStateListener = vi.fn();
  window.addEventListener('popstate', popStateListener);
  window.history.replaceState(null, '', '/bookings');
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status: 428,
    text: async () => JSON.stringify({
      success: false,
      error: {
        message: 'Password rotation is required before continuing.',
        statusCode: 428,
        code: 'password_rotation_required',
      },
    }),
  });
  globalThis.fetch = fetchMock as typeof fetch;

  try {
    await expect(api.get('/api/v1/bookings')).rejects.toBeInstanceOf(ApiError);
    expect(window.location.pathname).toBe('/change-password');
    expect(popStateListener).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  } finally {
    window.removeEventListener('popstate', popStateListener);
    window.history.replaceState(null, '', '/');
    globalThis.fetch = previousFetch;
  }
});
