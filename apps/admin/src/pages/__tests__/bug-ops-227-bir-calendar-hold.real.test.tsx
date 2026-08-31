import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
}));

import CompliancePage from '../CompliancePage';

it('Bug OPS-227 — the held BIR calendar makes no request for invented filing dates', () => {
  render(<MemoryRouter><CompliancePage /></MemoryRouter>);

  expect(screen.getByText('E22')).toBeVisible();
  expect(screen.getByText(/no accountant-approved principal-document design is in force/i)).toBeVisible();
  expect(screen.getByText(/do not issue, finalize, or describe an app record as a BIR filing/i)).toBeVisible();
  expect(apiMocks.get).not.toHaveBeenCalled();
});
