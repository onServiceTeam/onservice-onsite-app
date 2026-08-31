import { toPublicDsr, type DsrRecord } from '../src/services/compliance.service';

it('Bug UX-804 — customer DSR history excludes internal notes, handler identity, email, role, and cross-account IDs', () => {
  const publicRecord = toPublicDsr({
    id: '00000000-0000-0000-0000-000000000001',
    userId: '00000000-0000-0000-0000-000000000002',
    userEmail: 'private@example.test',
    userRole: 'customer',
    providerProfileId: null,
    requestType: 'access',
    status: 'in_progress',
    receivedAt: '2026-08-01T00:00:00.000Z',
    dueAt: '2026-08-16T00:00:00.000Z',
    completedAt: null,
    handledBy: '00000000-0000-0000-0000-000000000003',
    userMessage: 'Send my data.',
    adminNotes: 'Internal identity review evidence.',
    responsePayloadUrl: null,
    rejectionReason: null,
    daysUntilDue: 4,
    isOverdue: false,
  } satisfies DsrRecord);

  expect(publicRecord).toEqual(expect.objectContaining({ requestType: 'access', userMessage: 'Send my data.' }));
  expect(publicRecord).not.toHaveProperty('adminNotes');
  expect(publicRecord).not.toHaveProperty('handledBy');
  expect(publicRecord).not.toHaveProperty('userEmail');
  expect(publicRecord).not.toHaveProperty('userRole');
  expect(publicRecord).not.toHaveProperty('providerProfileId');
  expect(publicRecord).not.toHaveProperty('userId');
});
