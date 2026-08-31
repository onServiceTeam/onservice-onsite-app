import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'dpo' } }),
}));

import CompliancePage from '../CompliancePage';

it('Bug UX-816 — a DPO can open the segregated Privacy Workspace from Compliance', () => {
  render(<MemoryRouter><CompliancePage /></MemoryRouter>);

  expect(screen.getByText(/open privacy workspace/i).closest('a')).toHaveAttribute('to', '/privacy');
  expect(screen.queryByText(/escalate privacy cases to the DPO/i)).not.toBeInTheDocument();
});
