import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';

import CompliancePage from '../CompliancePage';

it('BUG-PHASE99-01 — compliance discloses its evidence boundary instead of offering a fake regulatory report', () => {
  render(<MemoryRouter><CompliancePage /></MemoryRouter>);

  expect(screen.getByText(/does not file with an agency or certify legal compliance/i)).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Audit evidence' }).closest('a'))
    .toHaveAttribute('to', '/audit-log');
  expect(screen.queryByRole('button', { name: /generate/i })).not.toBeInTheDocument();
  expect(screen.queryByText(/ETA Phase 14|not yet implemented/i)).not.toBeInTheDocument();
});
