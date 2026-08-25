import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return {
    ...actual,
    useLocation: () => ({
      pathname: '/providers/provider-123',
      search: '',
      hash: '',
      state: null,
      key: 'breadcrumb-test',
    }),
  };
});

import AdminBreadcrumbs from '../AdminBreadcrumbs';

describe('admin record context', () => {
  it('Bug UX-404 — preserves workspace and list context on record-detail routes', () => {
    render(
      <MemoryRouter initialEntries={['/providers/provider-123']}>
        <AdminBreadcrumbs />
      </MemoryRouter>,
    );

    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Command' }).getAttribute('href')).toBe('/');
    expect(screen.getByText('People')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Providers' }).getAttribute('href')).toBe(
      '/providers',
    );
    expect(screen.getByText('provider-123')).toBeTruthy();
  });
});
