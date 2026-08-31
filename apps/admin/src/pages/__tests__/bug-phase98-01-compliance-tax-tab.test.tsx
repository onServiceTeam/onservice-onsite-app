import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';

import CompliancePage from '../CompliancePage';

it('BUG-PHASE98-01 — the compliance control center routes tax evidence to the canonical held workpaper workspace', () => {
  render(<MemoryRouter><CompliancePage /></MemoryRouter>);

  expect(screen.getByRole('heading', { name: 'Tax workpapers (held)' }).closest('a'))
    .toHaveAttribute('to', '/financials?tab=bir');
  expect(screen.queryByText(/TODO: pulls from|Not yet wired/i)).not.toBeInTheDocument();
});
