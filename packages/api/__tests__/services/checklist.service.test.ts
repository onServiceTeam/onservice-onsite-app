// Phase 14 Dispatch 07 — checklist.service tests.
// Bug 460 (server-driven templates) + Bug 463 (server-side validation).

jest.mock('../../src/models/db', () => {
  const helper = jest.requireActual('../helpers/d06-tx-mock') as typeof import('../helpers/d06-tx-mock');
  return helper.createDbMock();
});

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import * as svc from '../../src/services/checklist.service';
import {
  resetDbMock,
  setTopQueryImpl,
  setTxQueryImpl,
  makeRouter,
  getTransactionInvocations,
} from '../helpers/d06-tx-mock';

const BOOKING_ID = '11111111-1111-1111-1111-111111111111';
const CATEGORY_ID = '22222222-2222-2222-2222-222222222222';
const PROVIDER_USER_ID = '33333333-3333-3333-3333-333333333333';
const CUSTOMER_ID = '44444444-4444-4444-4444-444444444444';
const TEMPLATE_ID = '55555555-5555-5555-5555-555555555555';
const CHECKLIST_ID = '66666666-6666-6666-6666-666666666666';
const ITEM_ID = '77777777-7777-7777-7777-777777777777';

beforeEach(resetDbMock);

describe('Bug 460 + 463 — getChecklistForBooking', () => {
  it('rejects 404 when booking missing', async () => {
    setTopQueryImpl(makeRouter([
      { match: /SELECT b\.id,\s+b\.category_id/, rows: [], rowCount: 0 },
    ]));
    await expect(
      svc.getChecklistForBooking(BOOKING_ID, PROVIDER_USER_ID, 'provider'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects 403 when provider role does not match booking provider', async () => {
    setTopQueryImpl(makeRouter([
      { match: /SELECT b\.id/, rows: [{
        id: BOOKING_ID,
        category_id: CATEGORY_ID,
        provider_user_id: 'someone-else',
        customer_id: CUSTOMER_ID,
        status: 'in_progress',
      }], rowCount: 1 },
    ]));
    await expect(
      svc.getChecklistForBooking(BOOKING_ID, PROVIDER_USER_ID, 'provider'),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects 404 when customer requests checklist that has not been created yet', async () => {
    setTopQueryImpl(makeRouter([
      { match: /SELECT b\.id/, rows: [{
        id: BOOKING_ID,
        category_id: CATEGORY_ID,
        provider_user_id: PROVIDER_USER_ID,
        customer_id: CUSTOMER_ID,
        status: 'in_progress',
      }], rowCount: 1 },
      { match: /SELECT id, template_id/, rows: [], rowCount: 0 },
    ]));
    await expect(
      svc.getChecklistForBooking(BOOKING_ID, CUSTOMER_ID, 'customer'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns existing checklist with sections + items', async () => {
    const now = new Date('2026-04-30T12:00:00Z');
    setTopQueryImpl(makeRouter([
      { match: /SELECT b\.id/, rows: [{
        id: BOOKING_ID,
        category_id: CATEGORY_ID,
        provider_user_id: PROVIDER_USER_ID,
        customer_id: CUSTOMER_ID,
        status: 'in_progress',
      }], rowCount: 1 },
      { match: /SELECT id, template_id, template_version, shown_at\s+FROM booking_checklists/, rows: [{
        id: CHECKLIST_ID,
        template_id: TEMPLATE_ID,
        template_version: 1,
        shown_at: now,
      }], rowCount: 1 },
      { match: /SELECT s\.id\s+AS section_id/, rows: [
        {
          section_id: 's1', section_title: 'Pre-service', section_order: 1,
          item_id: ITEM_ID, title: 'Inspect work area', description: null,
          photo_required: true, is_required: true,
          is_completed: false, completed_at: null, photo_id: null, notes: null,
        },
        {
          section_id: 's1', section_title: 'Pre-service', section_order: 1,
          item_id: 'item-2', title: 'Note damage', description: null,
          photo_required: false, is_required: false,
          is_completed: false, completed_at: null, photo_id: null, notes: null,
        },
        {
          section_id: 's2', section_title: 'Cleanup', section_order: 2,
          item_id: 'item-3', title: 'Walk-through with customer', description: null,
          photo_required: false, is_required: true,
          is_completed: true, completed_at: now, photo_id: null, notes: null,
        },
      ], rowCount: 3 },
    ]));

    const result = await svc.getChecklistForBooking(BOOKING_ID, PROVIDER_USER_ID, 'provider');

    expect(result.bookingChecklistId).toBe(CHECKLIST_ID);
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]!.title).toBe('Pre-service');
    expect(result.sections[0]!.items).toHaveLength(2);
    expect(result.sections[0]!.items[0]!.photoRequired).toBe(true);
    expect(result.sections[1]!.items[0]!.isCompleted).toBe(true);
  });

  it('creates checklist on provider first open by snapshotting template', async () => {
    const now = new Date('2026-04-30T12:00:00Z');
    setTopQueryImpl(makeRouter([
      { match: /SELECT b\.id/, rows: [{
        id: BOOKING_ID,
        category_id: CATEGORY_ID,
        provider_user_id: PROVIDER_USER_ID,
        customer_id: CUSTOMER_ID,
        status: 'in_progress',
      }], rowCount: 1 },
      // First lookup: no checklist yet.
      { match: /SELECT id, template_id, template_version, shown_at\s+FROM booking_checklists/, rows: [], rowCount: 0 },
      // Final assemble query (after creation in trx): returns nothing for simplicity.
      { match: /SELECT s\.id\s+AS section_id/, rows: [], rowCount: 0 },
    ]));
    setTxQueryImpl(makeRouter([
      // In-trx FOR UPDATE re-check: still no checklist.
      { match: /SELECT id, template_id, template_version, shown_at FROM booking_checklists WHERE booking_id = \$1 FOR UPDATE/, rows: [], rowCount: 0 },
      // Find active template.
      { match: /SELECT id, version FROM checklist_templates/, rows: [{ id: TEMPLATE_ID, version: 1 }], rowCount: 1 },
      // INSERT booking_checklists.
      { match: /INSERT INTO booking_checklists/, rows: [{
        id: CHECKLIST_ID,
        template_id: TEMPLATE_ID,
        template_version: 1,
        shown_at: now,
      }], rowCount: 1 },
      // Snapshot items query.
      { match: /SELECT i\.id AS item_id/, rows: [
        { item_id: 'tpl-i-1', title: 'Item 1', description: null, photo_required: true, is_required: true },
        { item_id: 'tpl-i-2', title: 'Item 2', description: 'desc', photo_required: false, is_required: true },
      ], rowCount: 2 },
      // INSERT items × N.
      { match: /INSERT INTO booking_checklist_items/, rowCount: 1 },
    ]));

    const result = await svc.getChecklistForBooking(BOOKING_ID, PROVIDER_USER_ID, 'provider');
    expect(result.bookingChecklistId).toBe(CHECKLIST_ID);
    expect(getTransactionInvocations()).toBe(1);
  });

  it('throws 500 when no template exists for the category', async () => {
    setTopQueryImpl(makeRouter([
      { match: /SELECT b\.id/, rows: [{
        id: BOOKING_ID,
        category_id: CATEGORY_ID,
        provider_user_id: PROVIDER_USER_ID,
        customer_id: CUSTOMER_ID,
        status: 'in_progress',
      }], rowCount: 1 },
      { match: /SELECT id, template_id, template_version, shown_at\s+FROM booking_checklists/, rows: [], rowCount: 0 },
    ]));
    setTxQueryImpl(makeRouter([
      { match: /SELECT id, template_id, template_version, shown_at FROM booking_checklists WHERE booking_id = \$1 FOR UPDATE/, rows: [], rowCount: 0 },
      { match: /SELECT id, version FROM checklist_templates/, rows: [], rowCount: 0 },
    ]));

    await expect(
      svc.getChecklistForBooking(BOOKING_ID, PROVIDER_USER_ID, 'provider'),
    ).rejects.toMatchObject({ statusCode: 500 });
  });
});

describe('Bug 463 — toggleChecklistItem photo_required enforcement', () => {
  it('rejects completion when photo_required and no photoId provided', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT bi\.id, bi\.title_snapshot/, rows: [{
        id: ITEM_ID,
        title_snapshot: 'Photo: kitchen after',
        photo_required: true,
        is_required: true,
        booking_id: BOOKING_ID,
        provider_user_id: PROVIDER_USER_ID,
        customer_id: CUSTOMER_ID,
      }], rowCount: 1 },
    ]));

    await expect(
      svc.toggleChecklistItem(ITEM_ID, PROVIDER_USER_ID, 'provider', { completed: true }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('accepts completion with valid photoId belonging to same booking', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT bi\.id, bi\.title_snapshot/, rows: [{
        id: ITEM_ID,
        title_snapshot: 'Photo: kitchen after',
        photo_required: true,
        is_required: true,
        booking_id: BOOKING_ID,
        provider_user_id: PROVIDER_USER_ID,
        customer_id: CUSTOMER_ID,
      }], rowCount: 1 },
      { match: /SELECT booking_id, deleted_at, photo_type, uploaded_by_role/, rows: [{ booking_id: BOOKING_ID, deleted_at: null, photo_type: 'checklist', uploaded_by_role: 'provider' }], rowCount: 1 },
      { match: /UPDATE booking_checklist_items/, rows: [{
        id: ITEM_ID,
        is_completed: true,
        completed_at: new Date('2026-04-30T13:00:00Z'),
        photo_id: 'photo-1',
      }], rowCount: 1 },
    ]));

    const result = await svc.toggleChecklistItem(
      ITEM_ID, PROVIDER_USER_ID, 'provider',
      { completed: true, photoId: 'photo-1' },
    );
    expect(result.isCompleted).toBe(true);
    expect(result.photoId).toBe('photo-1');
  });

  it('rejects when photoId belongs to a different booking', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT bi\.id, bi\.title_snapshot/, rows: [{
        id: ITEM_ID,
        title_snapshot: 'Photo: kitchen after',
        photo_required: true,
        is_required: true,
        booking_id: BOOKING_ID,
        provider_user_id: PROVIDER_USER_ID,
        customer_id: CUSTOMER_ID,
      }], rowCount: 1 },
      { match: /SELECT booking_id, deleted_at, photo_type, uploaded_by_role/, rows: [{ booking_id: 'other-booking', deleted_at: null, photo_type: 'checklist', uploaded_by_role: 'provider' }], rowCount: 1 },
    ]));

    await expect(
      svc.toggleChecklistItem(ITEM_ID, PROVIDER_USER_ID, 'provider', { completed: true, photoId: 'photo-1' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects when photo soft-deleted', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT bi\.id, bi\.title_snapshot/, rows: [{
        id: ITEM_ID,
        title_snapshot: 'Photo: kitchen after',
        photo_required: true,
        is_required: true,
        booking_id: BOOKING_ID,
        provider_user_id: PROVIDER_USER_ID,
        customer_id: CUSTOMER_ID,
      }], rowCount: 1 },
      { match: /SELECT booking_id, deleted_at, photo_type, uploaded_by_role/, rows: [{ booking_id: BOOKING_ID, deleted_at: new Date(), photo_type: 'checklist', uploaded_by_role: 'provider' }], rowCount: 1 },
    ]));

    await expect(
      svc.toggleChecklistItem(ITEM_ID, PROVIDER_USER_ID, 'provider', { completed: true, photoId: 'photo-1' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects 403 when toggler is not the booking provider', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT bi\.id, bi\.title_snapshot/, rows: [{
        id: ITEM_ID,
        title_snapshot: 'X',
        photo_required: false,
        is_required: true,
        booking_id: BOOKING_ID,
        provider_user_id: 'someone-else',
        customer_id: CUSTOMER_ID,
      }], rowCount: 1 },
    ]));
    await expect(
      svc.toggleChecklistItem(ITEM_ID, PROVIDER_USER_ID, 'provider', { completed: true }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('Bug 463 — getChecklistCompletionStatus (used by booking-completion gating)', () => {
  it('returns isFullyComplete: true when all required items are completed', async () => {
    setTopQueryImpl(makeRouter([
      { match: /COALESCE\(SUM\(CASE WHEN bi\.is_required/, rows: [{
        total_required: '5',
        completed_required: '5',
        checklist_count: '1',
      }], rowCount: 1 },
    ]));
    const result = await svc.getChecklistCompletionStatus(BOOKING_ID);
    expect(result.isFullyComplete).toBe(true);
    expect(result.totalRequired).toBe(5);
    expect(result.completedRequired).toBe(5);
    expect(result.checklistShown).toBe(true);
  });

  it('returns isFullyComplete: false when some required items pending', async () => {
    setTopQueryImpl(makeRouter([
      { match: /COALESCE\(SUM/, rows: [{
        total_required: '5',
        completed_required: '3',
        checklist_count: '1',
      }], rowCount: 1 },
    ]));
    const result = await svc.getChecklistCompletionStatus(BOOKING_ID);
    expect(result.isFullyComplete).toBe(false);
  });

  it('returns checklistShown: false when no checklist exists (Bug 463 — provider never opened it)', async () => {
    setTopQueryImpl(makeRouter([
      { match: /COALESCE\(SUM/, rows: [{
        total_required: '0',
        completed_required: '0',
        checklist_count: '0',
      }], rowCount: 1 },
    ]));
    const result = await svc.getChecklistCompletionStatus(BOOKING_ID);
    expect(result.checklistShown).toBe(false);
    expect(result.isFullyComplete).toBe(false);
  });
});
