// HA-M2-298 (customer human audit 2026-10-13, D38 Milestone 2; critique.md
// section 4, added by package P1 because it guards P1's notification:new
// emit): when the socket layer throws, createPushNotification() still stores
// the notification and returns it. The stored row is the authoritative record;
// the emit is best effort. Real notification rows on the guarded PostgreSQL
// fixture; only the socket emitter is made to fail.
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import { withRequestEngineDatabase } from './helpers/request-engine-postgres';
import * as socketService from '../src/services/socket.service';
import { createPushNotification } from '../src/services/notification.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-298: createPushNotification still stores and returns the notification when the socket emit throws', async () => {
  await withRequestEngineDatabase(async database => {
    const emit = jest.spyOn(socketService, 'emitToUser').mockImplementation(() => {
      throw new Error('Socket adapter unavailable');
    });
    try {
      const returned = await createPushNotification({
        userId: customerA,
        type: 'request_reopened',
        title: 'Request sent to more pros',
        body: "We've sent your request to more pros.",
        data: { bookingId: '83000000-0000-4000-8000-000000002981' },
      });

      const stored = await database.query('SELECT id, type, title FROM notifications WHERE user_id = $1', [customerA]);
      expect(stored.rows).toEqual([{ id: returned.id, type: 'request_reopened', title: 'Request sent to more pros' }]);
      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith(customerA, 'notification:new', expect.objectContaining({ id: returned.id }));
    } finally {
      emit.mockRestore();
    }
  });
}, 90000);
