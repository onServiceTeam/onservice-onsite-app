jest.mock('../src/models/db', () => {
  const helper = jest.requireActual('./helpers/d06-tx-mock') as typeof import('./helpers/d06-tx-mock');
  return helper.createDbMock();
});

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getChecklistForBooking } from '../src/services/checklist.service';
import {
  makeRouter,
  resetDbMock,
  setTopQueryImpl,
  setTxQueryImpl,
} from './helpers/d06-tx-mock';

beforeEach(resetDbMock);

it('Bug UX-303 — a category-only quote booking snapshots its category checklist', async () => {
  const now = new Date('2026-08-25T10:00:00.000Z');
  setTopQueryImpl(makeRouter([
    {
      match: /SELECT b\.id,\s+b\.category_id/,
      rows: [{
        id: 'booking-1',
        category_id: 'category-1',
        provider_user_id: 'provider-user-1',
        staff_user_id: null,
        staff_status: null,
        customer_id: 'customer-1',
        status: 'in_progress',
      }],
      rowCount: 1,
    },
    { match: /FROM booking_checklists/, rows: [], rowCount: 0 },
    { match: /AS section_id/, rows: [], rowCount: 0 },
  ]));
  setTxQueryImpl(makeRouter([
    { match: /FROM booking_checklists.*FOR UPDATE/, rows: [], rowCount: 0 },
    {
      match: /FROM checklist_templates/,
      rows: [{ id: 'template-1', version: 2 }],
      rowCount: 1,
    },
    {
      match: /INSERT INTO booking_checklists/,
      rows: [{
        id: 'checklist-1',
        template_id: 'template-1',
        template_version: 2,
        shown_at: now,
      }],
      rowCount: 1,
    },
    { match: /SELECT i\.id AS item_id/, rows: [], rowCount: 0 },
  ]));

  const result = await getChecklistForBooking('booking-1', 'provider-user-1', 'provider');

  expect(result).toMatchObject({
    bookingChecklistId: 'checklist-1',
    templateId: 'template-1',
    templateVersion: 2,
  });
});
