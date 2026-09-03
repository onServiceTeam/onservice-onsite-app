import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

const { FEEDBACK_ID, apiGet } = vi.hoisted(() => ({
  FEEDBACK_ID: '10791079-1079-4079-8079-107910791079',
  apiGet: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));

import AuditLogPage from '../AuditLogPage';
import FeedbackPage from '../FeedbackPage';

function LocationEvidence(): React.ReactElement {
  const location = useLocation();
  return <output aria-label="Current feedback audit handoff">{location.search}</output>;
}

it('Bug UX-1079 - a feedback triage audit event reopens the exact original submission and decision history', async () => {
  const record = {
    id: FEEDBACK_ID,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-03T00:00:00.000Z',
    testerName: 'Provider tester',
    testerContact: 'p***@e***',
    contactMasked: true,
    piiMasked: true,
    role: 'provider',
    device: 'Desktop Chrome',
    areas: ['provider'],
    nps: 7,
    summary: 'The provider proof screen needs clearer completion guidance.',
    itemCount: 1,
    payload: { ideas: 'Show the required proof sequence before work begins.' },
    status: 'triaged',
    assignedAdminId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    assignedAdminName: 'Ana Reyes',
    triageNote: 'Confirmed and assigned to the provider workflow review.',
  };
  apiGet.mockImplementation((url: string) => {
    if (url === '/api/v1/admin/audit-log') {
      return Promise.resolve({ data: {
        data: [{
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          source: 'audit_log',
          userId: record.assignedAdminId,
          userEmail: 'a***@o***',
          userRole: 'admin',
          action: 'feedback_submission_updated',
          entityType: 'feedback_submission',
          entityId: FEEDBACK_ID,
          oldValues: { status: 'new', assignedAdminId: null, triageNote: null },
          newValues: { status: 'triaged', assignedAdminId: record.assignedAdminId, triageNote: record.triageNote },
          ipAddress: null,
          userAgent: null,
          createdAt: record.updatedAt,
        }],
        pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
      } });
    }
    if (url === '/api/v1/admin/feedback') {
      return Promise.reject(new Error('Feedback queue temporarily unavailable.'));
    }
    if (url === `/api/v1/admin/feedback/${FEEDBACK_ID}`) {
      return Promise.resolve({ data: { success: true, data: record } });
    }
    if (url === `/api/v1/admin/feedback/${FEEDBACK_ID}/history`) {
      return Promise.resolve({ data: { success: true, data: { entries: [{
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        createdAt: record.updatedAt,
        adminName: 'Ana Reyes',
        adminRole: 'admin',
        previousStatus: 'new',
        nextStatus: 'triaged',
        previousOwnerName: null,
        nextOwnerName: 'Ana Reyes',
        note: record.triageNote,
      }] } } });
    }
    if (url === '/api/v1/support-tickets/agents') {
      return Promise.resolve({ data: { success: true, data: [] } });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const handoffRender = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/audit-log']}>
        <LocationEvidence />
        <Routes>
          <Route path="/audit-log" element={<AuditLogPage />} />
          <Route path="/feedback" element={<FeedbackPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect((await screen.findAllByText('Tester feedback triage updated')).length).toBeGreaterThan(0);
  const destination = `/feedback?feedbackId=${FEEDBACK_ID}`;
  const destinationLink = handoffRender.container.querySelector(`a[href="${destination}"]`);
  expect(destinationLink).not.toBeNull();
  fireEvent.click(destinationLink!);

  expect(await screen.findByRole('heading', { name: record.testerName })).toBeVisible();
  expect(screen.getByText('Feedback queue temporarily unavailable.')).toBeVisible();
  expect(screen.getByText(record.summary)).toBeVisible();
  expect(screen.getAllByText(record.triageNote).length).toBeGreaterThan(0);
  expect(screen.getByLabelText('Current feedback audit handoff')).toHaveTextContent(`?feedbackId=${FEEDBACK_ID}`);
  expect(apiGet).toHaveBeenCalledWith(`/api/v1/admin/feedback/${FEEDBACK_ID}`);
  expect(apiGet).toHaveBeenCalledWith(`/api/v1/admin/feedback/${FEEDBACK_ID}/history`);
});
