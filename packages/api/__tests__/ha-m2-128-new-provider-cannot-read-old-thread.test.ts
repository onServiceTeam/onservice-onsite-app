// HA-M2-128 (customer human audit 2026-10-13, D38 Milestone 2, package P4):
// after an admin reassignment the new provider cannot read what the customer
// and the old provider wrote. Before D38 the single booking conversation was
// handed to the new provider, history included. The real reassign route and
// participant routes on the guarded PostgreSQL fixture
// (helpers/reassign-postgres.ts); the time-overlap check is stubbed.
import * as matchingService from '../src/services/matching.service';
import { withReassignDatabase, reassignHttp, bookingBConversation } from './helpers/reassign-postgres';
import {
  bookingIntegrationIt as it, bookingB, customerB, providerA, providerUserA, providerUserB,
} from './helpers/booking-participant-postgres';
import { insertMessage, threadHttp } from './helpers/request-thread-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-128: after reassignment the new provider cannot read the old provider\'s messages', async () => {
  await withReassignDatabase(async database => {
    await insertMessage(database, bookingBConversation, customerB, 'The gate code is 4471.');
    await insertMessage(database, bookingBConversation, providerUserB, 'Thanks, noted the gate code.');
    const overlap = jest.spyOn(matchingService, 'hasBookingConflict').mockResolvedValue(false);
    try {
      expect((await reassignHttp()(bookingB, providerA)).status).toBe(200);
    } finally {
      overlap.mockRestore();
    }

    const newProvider = threadHttp(providerUserA, 'provider');
    expect((await newProvider.get(bookingBConversation)).status).toBe(404);
    expect((await newProvider.messages(bookingBConversation, { limit: 30 })).status).toBe(404);
    expect((await newProvider.messages(bookingBConversation, { page: 1, pageSize: 100 })).status).toBe(404);

    const list = await newProvider.list();
    expect(list.body.data.map((conversation: { bookingId: string; providerId: string }) => (
      [conversation.bookingId, conversation.providerId]))).toEqual([[bookingB, providerUserA]]);
    const ownThread = list.body.data[0].id as string;
    expect(ownThread).not.toBe(bookingBConversation);
    const ownMessages = await newProvider.messages(ownThread, { limit: 100 });
    expect(ownMessages.body.data.map((message: { systemEvent: string | null }) => message.systemEvent))
      .toEqual(['provider_reassigned_in']);
    expect(JSON.stringify([list.body, ownMessages.body])).not.toContain('4471');
  });
}, 90000);
