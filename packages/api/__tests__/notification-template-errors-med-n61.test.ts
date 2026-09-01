const mockDbQuery = jest.fn();
const mockGetTemplateBySlug = jest.fn();
const mockLoggerDebug = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => mockDbQuery(...args),
    transaction: jest.fn(),
  },
}));
jest.mock('../src/services/notification-template.service', () => ({
  getTemplateBySlug: (...args: unknown[]) => mockGetTemplateBySlug(...args),
  renderTemplate: jest.fn(),
}));
jest.mock('../src/services/socket.service', () => ({ emitToUser: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: (...args: unknown[]) => mockLoggerError(...args),
    debug: (...args: unknown[]) => mockLoggerDebug(...args),
  },
}));

import { notifyCustomerProviderAssigned } from '../src/services/notification.service';

it('MED-N61 - missing templates stay low-noise while real lookup failures are visible and fallback delivery continues', async () => {
  let notificationSequence = 0;
  mockDbQuery.mockImplementation(async (sql: string) => {
    if (/INSERT INTO notifications/.test(sql)) {
      notificationSequence += 1;
      return {
        rows: [{
          id: `notification-med-n61-${notificationSequence}`,
          user_id: 'customer-med-n61',
          type: 'provider_assigned',
          title: 'Provider Assigned',
          body: 'Ana Home Services has been assigned to your booking. They will contact you shortly.',
          data: {},
          is_read: false,
          created_at: new Date('2026-09-01T00:00:00.000Z'),
        }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  });

  mockGetTemplateBySlug.mockRejectedValueOnce(
    Object.assign(new Error('template not found'), { statusCode: 404 }),
  );
  await notifyCustomerProviderAssigned(
    'customer-med-n61',
    'booking-med-n61',
    'Ana Home Services',
  );

  expect(mockLoggerDebug).toHaveBeenCalledWith(
    expect.stringMatching(/template not found/i),
    { slug: 'booking_matched' },
  );
  expect(mockLoggerError).not.toHaveBeenCalledWith(
    expect.stringMatching(/template lookup failed/i),
    expect.anything(),
  );

  mockLoggerDebug.mockClear();
  mockLoggerError.mockClear();
  mockGetTemplateBySlug.mockRejectedValueOnce(new Error('template database unavailable'));
  await notifyCustomerProviderAssigned(
    'customer-med-n61',
    'booking-med-n61',
    'Ana Home Services',
  );

  expect(mockLoggerDebug).not.toHaveBeenCalledWith(
    expect.stringMatching(/template not found/i),
    expect.anything(),
  );
  expect(mockLoggerError).toHaveBeenCalledWith(
    expect.stringMatching(/template lookup failed/i),
    expect.objectContaining({
      slug: 'booking_matched',
      error: 'template database unavailable',
    }),
  );
  expect(notificationSequence).toBe(2);
});
