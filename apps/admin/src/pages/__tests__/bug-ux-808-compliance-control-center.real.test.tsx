import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
}));

import CompliancePage from '../CompliancePage';

it('Bug UX-808 — Compliance is a truthful hold-and-evidence index without duplicate editors or fake report generation', () => {
  render(<MemoryRouter><CompliancePage /></MemoryRouter>);

  expect(screen.getByRole('heading', { name: 'Compliance Control Center' })).toBeVisible();
  for (const escalation of ['E09', 'E14', 'E22', 'E37', 'E40']) {
    expect(screen.getByText(escalation)).toBeVisible();
  }
  expect(screen.getByRole('heading', { name: 'Audit evidence' }).closest('a')).toHaveAttribute('to', '/audit-log');
  expect(screen.getByRole('heading', { name: 'Tax workpapers (held)' }).closest('a')).toHaveAttribute('to', '/financials?tab=bir');
  expect(screen.queryByRole('button', { name: /generate compliance posture report/i })).not.toBeInTheDocument();
  expect(screen.queryByText(/NPC Compliance/i)).not.toBeInTheDocument();
});
