import * as matchingService from '../src/services/matching.service';
import * as socketService from '../src/services/socket.service';
import { withReassignDatabase, reassignHttp } from './helpers/reassign-postgres';
import {
  bookingIntegrationIt as it, participantSnapshot, bookingB, providerA, providerB,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// S1-12 supporting checks (OPS-560 is the bug test). Booking B is paid and
// assigned to provider B; provider A is eligible to take it over.

function noOverlap() {
  return jest.spyOn(matchingService, 'hasBookingConflict').mockResolvedValue(false);
}

it('reassigning a paid booking keeps it paid and records no status reset', async () => {
  await withReassignDatabase(async database => {
    const overlap = noOverlap();
    try {
      expect((await reassignHttp()(bookingB, providerA)).status).toBe(200);
      expect((await database.query('SELECT status, provider_id FROM bookings WHERE id=$1', [bookingB])).rows)
        .toEqual([{ status: 'paid', provider_id: providerA }]);
      expect((await database.query(`SELECT details ? 'statusReset' AS has_key, details->'statusReset' AS reset
          FROM admin_actions WHERE action_type='booking_reassigned'`)).rows)
        .toEqual([{ has_key: true, reset: null }]);
    } finally {
      overlap.mockRestore();
    }
  });
}, 60000);

it('reassigning a matched booking keeps it matched', async () => {
  await withReassignDatabase(async database => {
    await database.query("UPDATE bookings SET status='matched' WHERE id=$1", [bookingB]);
    const overlap = noOverlap();
    try {
      expect((await reassignHttp()(bookingB, providerA)).status).toBe(200);
      expect((await database.query('SELECT status, provider_id FROM bookings WHERE id=$1', [bookingB])).rows)
        .toEqual([{ status: 'matched', provider_id: providerA }]);
    } finally {
      overlap.mockRestore();
    }
  });
}, 60000);

it('the admin live feed gets a status-change event for a reset, and none when the status is kept', async () => {
  for (const [startStatus, expectStatusEvent] of [['provider_en_route', true], ['paid', false]] as const) {
    await withReassignDatabase(async database => {
      await database.query('UPDATE bookings SET status=$2 WHERE id=$1', [bookingB, startStatus]);
      const overlap = noOverlap();
      const emit = jest.spyOn(socketService, 'emitAdminEvent');
      try {
        expect((await reassignHttp()(bookingB, providerA)).status).toBe(200);
        const statusEvents = emit.mock.calls.filter(([event]) => event === socketService.ADMIN_EVENTS.BOOKING_STATUS_CHANGED);
        expect(statusEvents).toEqual(expectStatusEvent
          ? [[socketService.ADMIN_EVENTS.BOOKING_STATUS_CHANGED, { id: bookingB, oldStatus: 'provider_en_route', newStatus: 'paid' }]]
          : []);
        expect(emit).toHaveBeenCalledWith(socketService.ADMIN_EVENTS.BOOKING_PROVIDER_ASSIGNED,
          expect.objectContaining({ id: bookingB, newProviderId: providerA }));
      } finally {
        emit.mockRestore();
        overlap.mockRestore();
      }
    });
  }
}, 90000);

it('a booking whose provider already arrived still cannot be reassigned (D35 Q9) and nothing changes', async () => {
  await withReassignDatabase(async database => {
    await database.query("UPDATE bookings SET status='provider_arrived' WHERE id=$1", [bookingB]);
    const before = await participantSnapshot(database);
    const overlap = noOverlap();
    try {
      const response = await reassignHttp()(bookingB, providerA);

      expect(response.status).toBe(409);
      expect(response.body.error.message).toBe('Cannot reassign booking in status "provider_arrived".');
      expect(await participantSnapshot(database)).toEqual(before);
    } finally {
      overlap.mockRestore();
    }
  });
}, 60000);

it('a refused reassignment of an en-route booking leaves it en route with its provider', async () => {
  await withReassignDatabase(async database => {
    await database.query("UPDATE bookings SET status='provider_en_route' WHERE id=$1", [bookingB]);
    await database.query('UPDATE providers SET is_available=FALSE WHERE id=$1', [providerA]);
    const before = await participantSnapshot(database);
    const overlap = noOverlap();
    try {
      const response = await reassignHttp()(bookingB, providerA);

      expect(response.status).toBe(409);
      expect(response.body.error.message).toBe('New provider is not accepting work.');
      expect(await participantSnapshot(database)).toEqual(before);
      expect((await database.query('SELECT status, provider_id FROM bookings WHERE id=$1', [bookingB])).rows)
        .toEqual([{ status: 'provider_en_route', provider_id: providerB }]);
    } finally {
      overlap.mockRestore();
    }
  });
}, 60000);
