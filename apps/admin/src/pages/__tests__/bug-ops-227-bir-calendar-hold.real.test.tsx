import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));

import { BirTab } from '../CompliancePage';

it('Bug OPS-227 — the held BIR calendar makes no request for invented filing dates', () => {
  render(<BirTab />);

  expect(screen.getByRole('alert')).toHaveTextContent(/filing calendar is disabled/i);
  expect(screen.getByText(/No filing dates are published in the app/i)).toBeVisible();
  expect(apiMocks.get).not.toHaveBeenCalled();
});
