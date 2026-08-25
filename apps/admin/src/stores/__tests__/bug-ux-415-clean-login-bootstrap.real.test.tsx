import React, { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';

vi.unmock('@/stores/auth.store');

import { useAuthStore } from '../auth.store';

function AuthBootstrapHarness(): React.ReactElement {
  const hydrate = useAuthStore((state) => state.hydrate);
  const isLoading = useAuthStore((state) => state.isLoading);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return <p>{isLoading ? 'Loading' : isAuthenticated ? 'Signed in' : 'Signed out'}</p>;
}

it('Bug UX-415 — first-time admin login bootstrap settles signed out without unauthenticated API probes', async () => {
  document.cookie = 'admin_csrf=; Max-Age=0; Path=/';
  vi.mocked(api.get).mockReset();
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    mustRotatePassword: false,
  });

  render(<AuthBootstrapHarness />);

  expect(await screen.findByText('Signed out')).toBeTruthy();
  await waitFor(() => expect(api.get).not.toHaveBeenCalled());
});
