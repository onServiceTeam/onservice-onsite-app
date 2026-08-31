import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Header from '../Header';

it('Bug UX-767 — command search describes the support and project workspaces without claiming unsupported operations', () => {
  render(<MemoryRouter><Header /></MemoryRouter>);
  const search = screen.getByRole('textbox', { name: 'Search admin pages and records' });

  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: 'support' } });
  expect(screen.getByText('Cases, owners, replies, and internal notes')).toBeInTheDocument();
  expect(screen.queryByText(/SLAs/)).not.toBeInTheDocument();

  fireEvent.change(search, { target: { value: 'projects' } });
  expect(screen.getByText('Planning records, milestones, and linked accounts')).toBeInTheDocument();
});
