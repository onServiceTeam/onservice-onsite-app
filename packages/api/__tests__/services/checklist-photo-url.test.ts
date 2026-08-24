jest.mock('../../src/models/db', () => {
  const helper = jest.requireActual('../helpers/d06-tx-mock') as typeof import('../helpers/d06-tx-mock');
  return helper.createDbMock();
});
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getChecklistForBooking } from '../../src/services/checklist.service';
import { makeRouter, resetDbMock, setTopQueryImpl } from '../helpers/d06-tx-mock';

it('BUG-UX-149 — checklist reads return the persisted proof URL for remounts', async () => {
  resetDbMock();
  const now = new Date('2026-08-24T00:00:00.000Z');
  setTopQueryImpl(makeRouter([
    { match: /SELECT b\.id/, rows: [{
      id: 'booking-1', category_id: 'category-1', provider_user_id: 'provider-user-1',
      customer_id: 'customer-1', status: 'in_progress',
    }], rowCount: 1 },
    { match: /SELECT id, template_id, template_version, shown_at\s+FROM booking_checklists/, rows: [{
      id: 'checklist-1', template_id: 'template-1', template_version: 1, shown_at: now,
    }], rowCount: 1 },
    { match: /SELECT s\.id\s+AS section_id/, rows: [{
      section_id: 'section-1', section_title: 'Completion', section_order: 1,
      item_id: 'item-1', title: 'Photo proof', description: null,
      photo_required: true, is_required: true, is_completed: true,
      completed_at: now, photo_id: 'photo-9',
      photo_url: 'https://api.onservice.ph/uploads/photo-9.jpg', notes: null,
    }], rowCount: 1 },
  ]));

  const checklist = await getChecklistForBooking('booking-1', 'provider-user-1', 'provider');

  expect(checklist.sections[0]!.items[0]!.photoUrl).toBe(
    'https://api.onservice.ph/uploads/photo-9.jpg',
  );
});
