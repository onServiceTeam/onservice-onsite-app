// HA-REQ-3 (customer human audit 2026-10-13, D38): no single item is required
// in a request. A written description alone is enough, and so is one photo
// or one answered quick question. Before D38 a request needed 50+ characters
// and at least 2 photos.
// D38 Milestone 2 (package P2): a job request now stores the request-engine
// columns of migration 183 and its fan-out records invites, so this file runs
// on withRequestEngineDatabase (the same Milestone 1 fixture plus the real
// migrations 183 and 184). The behaviour under test is unchanged.
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import {
  marketplaceHttp, jobRequestBody, waitForLeadFanOut, quoteService,
} from './helpers/job-request-postgres';
import { withRequestEngineDatabase } from './helpers/request-engine-postgres';
import { insertStoredMedia } from './helpers/request-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
const mockPush = jest.fn().mockResolvedValue(undefined);
jest.mock('../src/services/notification.service', () => ({
  ...jest.requireActual('../src/services/notification.service'),
  sendPushNotification: (...args: unknown[]) => mockPush(...args),
}));

beforeEach(() => mockPush.mockClear());

it('HA-REQ-3: a request with only a 10+ character description and no photos is accepted', async () => {
  await withRequestEngineDatabase(async database => {
    const response = await marketplaceHttp(customerA, 'customer')
      .jobRequest(jobRequestBody({ subcategoryId: quoteService, description: 'Aircon leaks' }));

    expect(response.status).toBe(201);
    expect((await database.query(`SELECT description, job_photos, budget_min, budget_max, intake_answers
        FROM bookings WHERE id=$1`, [response.body.data.id])).rows).toEqual([{
      description: 'Aircon leaks', job_photos: [], budget_min: null, budget_max: null, intake_answers: null,
    }]);
    await waitForLeadFanOut(mockPush, 1);
  });
}, 60000);

it('HA-REQ-3: a request with only one photo and no description is accepted', async () => {
  await withRequestEngineDatabase(async database => {
    const response = await marketplaceHttp(customerA, 'customer').jobRequest(jobRequestBody({
      subcategoryId: quoteService, description: undefined, jobPhotos: ['https://app.onservice.ph/uploads/job-request/a.jpg'],
    }));

    expect(response.status).toBe(201);
    expect((await database.query('SELECT description, job_photos FROM bookings WHERE id=$1',
      [response.body.data.id])).rows).toEqual([{
      description: '', job_photos: ['https://app.onservice.ph/uploads/job-request/a.jpg'],
    }]);
    await waitForLeadFanOut(mockPush, 1);
  });
}, 60000);

it('HA-REQ-3: a request with only one answered quick question is accepted', async () => {
  await withRequestEngineDatabase(async database => {
    const response = await marketplaceHttp(customerA, 'customer').jobRequest(jobRequestBody({
      subcategoryId: quoteService, description: '', intakeAnswers: { unit_count: 2 },
    }));

    expect(response.status).toBe(201);
    expect((await database.query('SELECT intake_answers FROM bookings WHERE id=$1',
      [response.body.data.id])).rows).toEqual([{ intake_answers: { unit_count: 2 } }]);
    await waitForLeadFanOut(mockPush, 1);
  });
}, 60000);

// D38 Milestone 2 (W3 step I1): an uploaded photo (a stored job-media item
// sent as mediaIds) counts as content on its own, like a jobPhotos link.
it('HA-REQ-3: a request with only one uploaded photo (mediaIds) and no description is accepted', async () => {
  await withRequestEngineDatabase(async database => {
    const photo = await insertStoredMedia(database, customerA);

    const response = await marketplaceHttp(customerA, 'customer').jobRequest(jobRequestBody({
      subcategoryId: quoteService, description: '', mediaIds: [photo],
    }));

    expect(response.status).toBe(201);
    expect((await database.query('SELECT b.description, m.status FROM bookings b JOIN job_media m ON m.booking_id = b.id WHERE b.id=$1',
      [response.body.data.id])).rows).toEqual([{ description: '', status: 'attached' }]);
    await waitForLeadFanOut(mockPush, 1);
  });
}, 60000);

it('HA-REQ-3: a budget range in centavos is saved as sent', async () => {
  await withRequestEngineDatabase(async database => {
    const response = await marketplaceHttp(customerA, 'customer').jobRequest(jobRequestBody({
      subcategoryId: quoteService, budgetMin: 150000, budgetMax: 250000,
    }));

    expect(response.status).toBe(201);
    expect((await database.query('SELECT budget_min::text AS min, budget_max::text AS max FROM bookings WHERE id=$1',
      [response.body.data.id])).rows).toEqual([{ min: '150000', max: '250000' }]);
    await waitForLeadFanOut(mockPush, 1);
  });
}, 60000);
