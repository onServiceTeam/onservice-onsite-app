import * as matchingService from '../src/services/matching.service';
import { withReassignDatabase, reassignHttp } from './helpers/reassign-postgres';
import {
  bookingIntegrationIt as it, participantHttp, bookingB, providerA, providerUserA,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug OPS-560 - reassigning a booking whose old provider was en route returns it to paid for the new provider', async () => {
  await withReassignDatabase(async database => {
    await database.query("UPDATE bookings SET status='provider_en_route' WHERE id=$1", [bookingB]);
    const overlap = jest.spyOn(matchingService, 'hasBookingConflict').mockResolvedValue(false);
    try {
      const response = await reassignHttp()(bookingB, providerA);

      expect(response.status).toBe(200);
      // Before OPS-560 the booking kept the old provider's "on the way"
      // status, so the new provider's job opened as already travelling.
      expect((await database.query('SELECT status, provider_id, performer_staff_id FROM bookings WHERE id=$1', [bookingB])).rows)
        .toEqual([{ status: 'paid', provider_id: providerA, performer_staff_id: null }]);
      // The reset is part of the recorded admin action.
      expect((await database.query(`SELECT details->'statusReset' AS reset FROM admin_actions
          WHERE action_type='booking_reassigned' AND target_id=$1`, [bookingB])).rows)
        .toEqual([{ reset: { from: 'provider_en_route', to: 'paid' } }]);
      // The new provider can now set off themselves.
      expect((await participantHttp(providerUserA, 'provider')(bookingB, 'provider_en_route')).status).toBe(200);
      expect((await database.query('SELECT status FROM bookings WHERE id=$1', [bookingB])).rows)
        .toEqual([{ status: 'provider_en_route' }]);
    } finally {
      overlap.mockRestore();
    }
  });
}, 60000);
