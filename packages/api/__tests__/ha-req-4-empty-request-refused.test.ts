// HA-REQ-4 (customer human audit 2026-10-13, D38): a request has to tell the
// provider something. An empty request (no description, no photo, no answer)
// is refused with a clear message, and the D38 photo and budget bounds hold.
// One rule per test: a reversed budget and a negative budget are refused; a 0
// budget (sent by APKs up to 1.0.2) is read as no budget.
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import {
  withJobRequestDatabase, marketplaceHttp, jobRequestBody, quoteService, waitForLeadFanOut,
} from './helpers/job-request-postgres';
import type { Pool } from 'pg';
import { JOB_REQUEST_EMPTY_MESSAGE } from '../src/validators/booking.validators';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
const mockPush = jest.fn().mockResolvedValue(undefined);
jest.mock('../src/services/notification.service', () => ({
  ...jest.requireActual('../src/services/notification.service'),
  sendPushNotification: (...args: unknown[]) => mockPush(...args),
}));

beforeEach(() => mockPush.mockClear());

async function bookingCount(database: Pool): Promise<number> {
  return (await database.query<{ n: number }>('SELECT count(*)::int AS n FROM bookings')).rows[0]!.n;
}

it('HA-REQ-4: an empty request (no description, no photo, no answers) is refused with a clear message and nothing is saved', async () => {
  await withJobRequestDatabase(async database => {
    const before = await bookingCount(database);

    const response = await marketplaceHttp(customerA, 'customer').jobRequest(jobRequestBody({
      subcategoryId: quoteService, description: '', jobPhotos: [], intakeAnswers: {},
    }));

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([{ field: 'description', message: JOB_REQUEST_EMPTY_MESSAGE }]);
    expect(JOB_REQUEST_EMPTY_MESSAGE).toBe(
      'Tell the pro about the job: write at least 10 characters, add a photo, or answer a quick question.',
    );
    expect(await bookingCount(database)).toBe(before);
    expect(mockPush).not.toHaveBeenCalled();
  });
}, 60000);

it('HA-REQ-4: 9 letters padded with spaces and a blank answer still count as an empty request', async () => {
  await withJobRequestDatabase(async database => {
    const before = await bookingCount(database);

    const response = await marketplaceHttp(customerA, 'customer').jobRequest(jobRequestBody({
      subcategoryId: quoteService, description: '  a i r c o n   l e a  ', intakeAnswers: { brand: '   ' },
    }));

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([{ field: 'description', message: JOB_REQUEST_EMPTY_MESSAGE }]);
    expect(await bookingCount(database)).toBe(before);
  });
}, 60000);

it('HA-REQ-4: a request with 11 photos is refused (the server limit stays 10 for older APKs)', async () => {
  await withJobRequestDatabase(async database => {
    const before = await bookingCount(database);
    const photos = Array.from({ length: 11 }, (_, i) => `https://app.onservice.ph/uploads/job-request/${i}.jpg`);

    const response = await marketplaceHttp(customerA, 'customer')
      .jobRequest(jobRequestBody({ subcategoryId: quoteService, jobPhotos: photos }));

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([
      { field: 'jobPhotos', message: 'Up to 10 photos can be attached to a request' },
    ]);
    expect(await bookingCount(database)).toBe(before);
  });
}, 60000);

it('HA-REQ-4: a budget whose maximum is below its minimum is refused and nothing is saved', async () => {
  await withJobRequestDatabase(async database => {
    const before = await bookingCount(database);

    const response = await marketplaceHttp(customerA, 'customer')
      .jobRequest(jobRequestBody({ subcategoryId: quoteService, budgetMin: 300000, budgetMax: 200000 }));

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([
      { field: 'budgetMax', message: 'Maximum budget must be greater than or equal to minimum budget' },
    ]);
    expect(await bookingCount(database)).toBe(before);
  });
}, 60000);

it('HA-REQ-4: a negative budget is refused and nothing is saved', async () => {
  await withJobRequestDatabase(async database => {
    const before = await bookingCount(database);

    const response = await marketplaceHttp(customerA, 'customer')
      .jobRequest(jobRequestBody({ subcategoryId: quoteService, budgetMin: -50000 }));

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([{ field: 'budgetMin', message: 'Budget must be more than zero' }]);
    expect(await bookingCount(database)).toBe(before);
  });
}, 60000);

// Installed APKs up to 1.0.2 send 0 when a customer types 0 in a budget box.
// Refusing it would break those requests; a 0 never meant a real price, so it
// is read as "no budget" and is never stored.
it('HA-REQ-4: a zero budget from an older app is saved as no budget instead of being refused', async () => {
  await withJobRequestDatabase(async database => {
    const response = await marketplaceHttp(customerA, 'customer')
      .jobRequest(jobRequestBody({ subcategoryId: quoteService, budgetMin: 0, budgetMax: 300000 }));

    expect(response.status).toBe(201);
    expect((await database.query('SELECT budget_min::text AS budget_min, budget_max::text AS budget_max FROM bookings WHERE id=$1',
      [response.body.data.id])).rows).toEqual([{ budget_min: null, budget_max: '300000' }]);
    await waitForLeadFanOut(mockPush, 1);
  });
}, 60000);
