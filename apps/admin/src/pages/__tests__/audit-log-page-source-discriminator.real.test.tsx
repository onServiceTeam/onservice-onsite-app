// Behavioral test for AuditLogPage source discriminator + ACTION_LABELS.
//
// Renders the page with a stubbed api response containing one row from
// each source stream and asserts:
//   1. The truthful "System event" + "Admin decision" badges render.
//   2. ACTION_LABELS rewrites known admin action types to friendly text.
//   3. Unknown action strings pass through verbatim.
//   4. The source filter dropdown is present.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/api', () => {
  const get = vi.fn().mockResolvedValue({
    data: {
      data: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          source: 'audit_log',
          userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          userEmail: 'admin@onservice.us',
          userRole: 'admin',
          action: 'POST /api/v1/foo',
          entityType: 'request',
          entityId: null,
          oldValues: null,
          newValues: null,
          ipAddress: '127.0.0.1',
          userAgent: 'jest',
          reason: null,
          createdAt: new Date('2026-05-03T01:00:00Z').toISOString(),
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          source: 'admin_actions',
          userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          userEmail: 'admin@onservice.us',
          userRole: 'super_admin',
          action: 'staff_added',
          entityType: 'admin_staff',
          entityId: '33333333-3333-4333-8333-333333333333',
          oldValues: null,
          newValues: { role: 'admin', email: 'new@onservice.ph' },
          ipAddress: null,
          userAgent: null,
          reason: 'Onboarding new ops team member.',
          createdAt: new Date('2026-05-03T02:00:00Z').toISOString(),
        },
      ],
      pagination: { page: 1, pageSize: 50, total: 2, totalPages: 1 },
    },
  });
  return { default: { get }, api: { get } };
});

import AuditLogPage from '../AuditLogPage';

beforeEach(() => {
  // No-op — vi.mock above is hoisted.
});

function withProviders(child: React.ReactElement): React.ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return React.createElement(
    QueryClientProvider,
    { client },
    React.createElement(MemoryRouter, { initialEntries: ['/'] }, child),
  );
}

describe('LL#5 admin audit timeline — source discriminator + action labels', () => {
  it('renders both source badges without claiming complete request coverage', async () => {
    const { container } = render(withProviders(<AuditLogPage />));
    await waitFor(() => {
      // Two rows in the body.
      const rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getAllByText('System event').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Admin decision').length).toBeGreaterThan(0);
  });

  it('rewrites known admin action types via ACTION_LABELS', async () => {
    const { container } = render(withProviders(<AuditLogPage />));
    await waitFor(() => {
      expect(container.textContent ?? '').toContain('Staff member added');
    });
    // Raw action string must NOT be the visible label (the badge does that).
    expect(container.textContent ?? '').not.toContain(
      'staff_added — admin_staff',
    );
  });

  it('passes unknown action strings through verbatim', async () => {
    const { container } = render(withProviders(<AuditLogPage />));
    await waitFor(() => {
      expect(container.textContent ?? '').toContain('POST /api/v1/foo');
    });
  });

  it('renders the source filter select', async () => {
    const { container } = render(withProviders(<AuditLogPage />));
    await waitFor(() => {
      const select = container.querySelector('select');
      expect(select).not.toBeNull();
    });
    const select = container.querySelector('select') as HTMLSelectElement;
    const opts = Array.from(select.querySelectorAll('option')).map((o) => o.value);
    expect(opts).toContain('all');
    expect(opts).toContain('audit_log');
    expect(opts).toContain('admin_actions');
  });
});
