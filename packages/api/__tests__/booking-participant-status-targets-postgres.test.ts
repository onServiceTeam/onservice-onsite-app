import type { Response } from 'supertest';
import { db } from '../src/models/db';
import { appendProviderAssignmentTermsInTransaction } from '../src/services/booking-financial-terms.service';
import { VALID_TRANSITIONS } from '../src/types/booking.types';
import {
  bookingIntegrationIt as it, withParticipantRefundDatabase, participantHttp, participantSnapshot,
  customerB, providerUserB, providerB, bookingB,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// The S1-4 acceptance check: what the general status route answers a
// customer and a provider for every booking status, per the repair contract
// K07 TRANSITION_ACTORS. The bug-specific tests are SEC-092, OPS-556 and
// SEC-093; this pins the whole table so no status slips through unnoticed.
//
// - allowed: the role's own step. It passes the role check and reaches the
//   state machine, which refuses it here because paid_out has no next step.
// - flow_only: 409 BOOKING_TRANSITION_FLOW_ONLY; a dedicated flow sets it.
// - other_role: 403; the step belongs to the other participant.
type Outcome = 'allowed' | 'flow_only' | 'other_role';

const FLOW_ONLY_STATUSES = {
  requested: 'flow_only', quoted: 'flow_only', matched: 'flow_only',
  payment_pending: 'flow_only', paid: 'flow_only', disputed: 'flow_only',
  resolved: 'flow_only', payout_ready: 'flow_only', paid_out: 'flow_only',
  cancelled_by_admin: 'flow_only',
} as const;

const EXPECTED: Record<'customer' | 'provider', Record<string, Outcome>> = {
  customer: {
    ...FLOW_ONLY_STATUSES,
    confirmed: 'allowed', cancelled_by_customer: 'allowed',
    provider_en_route: 'other_role', provider_arrived: 'other_role', in_progress: 'other_role',
    completed_by_provider: 'other_role', cancelled_by_provider: 'other_role',
  },
  provider: {
    ...FLOW_ONLY_STATUSES,
    provider_en_route: 'allowed', provider_arrived: 'allowed', in_progress: 'allowed',
    completed_by_provider: 'allowed', cancelled_by_provider: 'allowed',
    confirmed: 'other_role', cancelled_by_customer: 'other_role',
  },
};

const OTHER_ROLE_MESSAGE = {
  customer: 'Customers cannot perform this action.',
  provider: 'Providers cannot perform this action.',
};

function classify(role: 'customer' | 'provider', target: string, response: Response): string {
  const error = response.body.error ?? {};
  if (response.status === 409 && error.code === 'BOOKING_TRANSITION_FLOW_ONLY'
    && error.message === 'This booking change can\'t be made from here.') {
    return 'flow_only';
  }
  if (response.status === 403 && error.code === undefined && error.message === OTHER_ROLE_MESSAGE[role]) {
    return 'other_role';
  }
  if (response.status === 409 && error.code === undefined
    && error.message === `Cannot transition from "paid_out" to "${target}". Allowed transitions: none (terminal state).`) {
    return 'allowed';
  }
  return `unexpected ${response.status} ${JSON.stringify(error)}`;
}

it('customers and providers get the contract answer for every booking status on the status route', async () => {
  await withParticipantRefundDatabase(async database => {
    await db.transaction(async client => {
      await client.query("UPDATE bookings SET provider_id=$2, status='paid_out' WHERE id=$1", [bookingB, providerB]);
      await appendProviderAssignmentTermsInTransaction(client, {
        bookingId: bookingB, providerId: providerB, event: 'provider_assigned', sourceEventId: bookingB,
      });
    });
    const before = await participantSnapshot(database);

    const allStatuses = Object.keys(VALID_TRANSITIONS).sort();
    expect(allStatuses).toHaveLength(17);
    for (const [role, userId] of [['customer', customerB], ['provider', providerUserB]] as const) {
      // A new status must be classified here before this test can pass.
      expect(Object.keys(EXPECTED[role]).sort()).toEqual(allStatuses);
      const patch = participantHttp(userId, role);
      for (const [target, outcome] of Object.entries(EXPECTED[role])) {
        const response = await patch(bookingB, target);
        expect({ role, target, result: classify(role, target, response) }).toEqual({ role, target, result: outcome });
      }
    }
    expect(await participantSnapshot(database)).toEqual(before);
  });
}, 120000);
