import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ role: 'dpo' as 'admin' | 'super_admin' | 'dpo' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: auth.role } }),
}));

import { RoleRouteGuard } from '@/App';

it('Bug UX-561 — direct admin URLs redirect each role to its authorized workspace', () => {
  auth.role = 'dpo';
  render(
    <MemoryRouter initialEntries={['/bookings']}>
      <Routes>
        <Route element={<RoleRouteGuard allowed={['admin', 'super_admin']} />}>
          <Route path="/bookings" element={<p>Booking operations</p>} />
        </Route>
        <Route path="/privacy" element={<p>Privacy home</p>} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByText('Privacy home')).toBeInTheDocument();
  expect(screen.queryByText('Booking operations')).not.toBeInTheDocument();

  cleanup();
  auth.role = 'admin';
  render(
    <MemoryRouter initialEntries={['/data-protection-log']}>
      <Routes>
        <Route element={<RoleRouteGuard allowed={['dpo', 'super_admin']} />}>
          <Route path="/data-protection-log" element={<p>Privacy records</p>} />
        </Route>
        <Route path="/" element={<p>Operations home</p>} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByText('Operations home')).toBeInTheDocument();
  expect(screen.queryByText('Privacy records')).not.toBeInTheDocument();
});
