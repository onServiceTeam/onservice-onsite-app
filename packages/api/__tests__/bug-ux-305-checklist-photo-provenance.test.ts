jest.mock('../src/models/db', () => {
  const helper = jest.requireActual('./helpers/d06-tx-mock') as typeof import('./helpers/d06-tx-mock');
  return helper.createDbMock();
});

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { toggleChecklistItem } from '../src/services/checklist.service';
import {
  makeRouter,
  resetDbMock,
  setTxQueryImpl,
} from './helpers/d06-tx-mock';

beforeEach(resetDbMock);

it('Bug UX-305 — customer intake media cannot satisfy provider checklist proof', async () => {
  setTxQueryImpl(makeRouter([
    {
      match: /SELECT bi\.id, bi\.title_snapshot/,
      rows: [{
        id: 'item-1',
        title_snapshot: 'Photograph the finished work',
        photo_required: true,
        is_required: true,
        booking_id: 'booking-1',
        provider_user_id: 'provider-user-1',
        staff_user_id: null,
        staff_status: null,
        customer_id: 'customer-1',
      }],
      rowCount: 1,
    },
    {
      match: /SELECT booking_id, deleted_at, photo_type, uploaded_by_role/,
      rows: [{
        booking_id: 'booking-1',
        deleted_at: null,
        photo_type: 'issue',
        uploaded_by_role: 'customer',
      }],
      rowCount: 1,
    },
  ]));

  await expect(toggleChecklistItem(
    'item-1',
    'provider-user-1',
    'provider',
    { completed: true, photoId: 'customer-photo-1' },
  )).rejects.toMatchObject({ statusCode: 400 });
});
