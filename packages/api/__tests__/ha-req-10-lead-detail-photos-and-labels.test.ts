// HA-REQ-10, server half (customer human audit 2026-10-13, D38): the lead
// detail behind the provider quote screen returns the customer's photo URLs
// and each answer under the admin-written question label, and still never
// returns the street address or the exact map pin to a provider who has not
// been booked. Real SQL on the guarded PostgreSQL fixture.
// D38 Milestone 2 (package P2): a job request now stores the request-engine
// columns of migration 183 and its fan-out records invites, so this file runs
// on withRequestEngineDatabase (the same Milestone 1 fixture plus the real
// migrations 183 and 184). The behaviour under test is unchanged.
import { bookingIntegrationIt as it, customerA, providerUserA } from './helpers/booking-participant-postgres';
import {
  marketplaceHttp, jobRequestBody, waitForLeadFanOut, quoteService,
} from './helpers/job-request-postgres';
import { withRequestEngineDatabase } from './helpers/request-engine-postgres';
import { getOpenJobRequestForProvider } from '../src/services/job-leads.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
const mockPush = jest.fn().mockResolvedValue(undefined);
jest.mock('../src/services/notification.service', () => ({
  ...jest.requireActual('../src/services/notification.service'),
  sendPushNotification: (...args: unknown[]) => mockPush(...args),
}));

it('HA-REQ-10: lead detail returns the photo URLs and question labels in admin order, without the street address', async () => {
  await withRequestEngineDatabase(async database => {
    await database.query(`INSERT INTO subcategory_intake_fields
        (subcategory_id, field_key, label, field_type, unit, sort_order, is_active) VALUES
      ($1, 'has_power', 'Does the unit still turn on?', 'boolean', NULL, 2, TRUE),
      ($1, 'unit_count', 'How many aircon units need work?', 'number', 'units', 1, TRUE),
      ($1, 'brand', 'What brand is the unit?', 'text', NULL, 3, FALSE)`, [quoteService]);
    await database.query("UPDATE users SET first_name='Ana', last_name='Cruz' WHERE id=$1", [customerA]);
    const photos = [
      'https://app.onservice.ph/uploads/job-request/one.jpg',
      'https://app.onservice.ph/uploads/job-request/two.jpg',
    ];
    const created = await marketplaceHttp(customerA, 'customer').jobRequest(jobRequestBody({
      subcategoryId: quoteService,
      jobPhotos: photos,
      budgetMax: 250000,
      intakeAnswers: { has_power: true, brand: 'Carrier', unit_count: 2, old_question: 'kept' },
    }));
    expect(created.status).toBe(201);
    await waitForLeadFanOut(mockPush, 1);

    const lead = await getOpenJobRequestForProvider(providerUserA, created.body.data.id);

    expect(lead.jobPhotos).toEqual(photos);
    expect(lead.budgetMax).toBe(250000);
    expect(lead.intakeQuestions).toEqual([
      { key: 'unit_count', label: 'How many aircon units need work?', unit: 'units', value: 2 },
      { key: 'has_power', label: 'Does the unit still turn on?', unit: null, value: true },
      // A question switched off after the customer answered keeps its label.
      { key: 'brand', label: 'What brand is the unit?', unit: null, value: 'Carrier' },
      { key: 'old_question', label: null, unit: null, value: 'kept' },
    ]);
    expect(lead).toMatchObject({ barangay: 'Kamputhaw', city: 'Cebu City', province: 'Cebu' });
    expect(lead).not.toHaveProperty('address');
    expect(lead).not.toHaveProperty('latitude');
    expect(lead).not.toHaveProperty('longitude');
    expect(JSON.stringify(lead)).not.toContain('22 Mango Avenue');
  });
}, 60000);
