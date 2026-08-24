// MED-N133 / MED-N142 / MED-N146 / MED-N150 / MED-N151 fixes verified.

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));

const createNotificationMock = jest.fn().mockResolvedValue(undefined);
jest.mock('../src/services/notification.service', () => ({
  createPushNotification: (...args: unknown[]) => createNotificationMock(...args),
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { processSlotAvailability } from '../src/services/slot-waitlist.service';
import { deleteTemplate } from '../src/services/notification-template.service';
import { createPromotion, deletePromotion, updatePromotion } from '../src/services/promotion.service';
import { decide as decideAreaChange } from '../src/services/service-area-change.service';

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  createNotificationMock.mockReset();
  createNotificationMock.mockResolvedValue(undefined);
  dbTransactionMock.mockImplementation(async (cb: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (cb as any)({
      query: (sql: string, params?: unknown[]) => dbQueryMock(sql, params),
    });
  });
});

describe('MED-N133 — slot waitlist dispatches notification on availability', () => {
  it('MED-N133 — calls createNotification once per matched waitlist entry', async () => {
    // SELECT waitlist entries.
    dbQueryMock.mockResolvedValueOnce({
      rows: [
        { id: 'w1', customer_id: 'u1', category_id: 'cat-1', city: 'Boracay', preferred_date: '2026-06-01', status: 'waiting', expires_at: new Date(Date.now() + 3600000) },
        { id: 'w2', customer_id: 'u2', category_id: 'cat-1', city: 'Boracay', preferred_date: '2026-06-01', status: 'waiting', expires_at: new Date(Date.now() + 3600000) },
      ],
      rowCount: 2,
    });
    // UPDATE booking_slot_waitlist (bulk).
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 2 });

    const count = await processSlotAvailability('cat-1', 'Boracay', '2026-06-01');
    expect(count).toBe(2);
    expect(createNotificationMock).toHaveBeenCalledTimes(2);
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', type: 'area_launch' }),
    );
  });

  it('MED-N133 — notification failure does NOT block the batch', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [
        { id: 'w1', customer_id: 'u1', category_id: 'cat-1', city: 'Boracay', preferred_date: '2026-06-01', status: 'waiting', expires_at: new Date() },
        { id: 'w2', customer_id: 'u2', category_id: 'cat-1', city: 'Boracay', preferred_date: '2026-06-01', status: 'waiting', expires_at: new Date() },
      ],
      rowCount: 2,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 2 });
    createNotificationMock
      .mockRejectedValueOnce(new Error('notify down'))
      .mockResolvedValueOnce(undefined);

    const count = await processSlotAvailability('cat-1', 'Boracay', '2026-06-01');
    expect(count).toBe(2);
    expect(createNotificationMock).toHaveBeenCalledTimes(2);
  });
});

describe('MED-N142 — deleteTemplate captures pre-state + writes audit', () => {
  it('MED-N142 — INSERTs admin_actions config_changed with deleted snapshot in details', async () => {
    // SELECT FOR UPDATE — template exists.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 't1', slug: 'booking_confirmed_sms', title_template: 'Tit', body_template: 'Bod',
        type: 'booking', channel: 'sms',
        is_active: true, variables: [], created_by: null, updated_by: null,
        created_at: new Date(), updated_at: new Date(),
      }],
      rowCount: 1,
    });
    // DELETE.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // INSERT admin_actions.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await deleteTemplate('t1', 'super-1');

    const auditCall = dbQueryMock.mock.calls.find(
      ([sql]) => /INSERT INTO admin_actions/.test(sql as string),
    );
    expect(auditCall).toBeDefined();
    const params = auditCall![1] as unknown[];
    const details = JSON.parse(params[2] as string);
    expect(details.op).toBe('delete');
    expect(details.slug).toBe('booking_confirmed_sms');
    expect(details.deletedTitleTemplate).toBe('Tit');
  });
});

describe('MED-N150 + MED-N151 — promotion lifecycle audit', () => {
  it('MED-N151 — createPromotion writes admin_actions when createdBy provided', async () => {
    // INSERT promotion RETURNING.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'pr-1', title: 'Summer Sale', target_audience: 'all', is_active: true }],
      rowCount: 1,
    });
    // INSERT admin_actions.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await createPromotion({
      title: 'Summer Sale',
      targetAudience: 'all',
      createdBy: 'super-1',
    });
    const auditCall = dbQueryMock.mock.calls.find(
      ([sql]) => /INSERT INTO admin_actions/.test(sql as string),
    );
    expect(auditCall).toBeDefined();
    const details = JSON.parse((auditCall![1] as unknown[])[2] as string);
    expect(details.op).toBe('create');
    expect(details.title).toBe('Summer Sale');
  });

  it('MED-N151 — updatePromotion writes admin_actions with before/after', async () => {
    // SELECT FOR UPDATE existing.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'pr-1', title: 'Old Title', subtitle: null, image_url: null,
        badge: null, cta_text: null, cta_link: null, target_audience: 'all',
        start_date: new Date(), end_date: null, is_active: true, display_order: 0,
        created_by: null, created_at: new Date(), updated_at: new Date(),
      }],
      rowCount: 1,
    });
    // UPDATE.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'pr-1', title: 'New Title' }], rowCount: 1,
    });
    // INSERT admin_actions.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await updatePromotion('pr-1', { title: 'New Title', updatedByAdminId: 'super-1' });

    const auditCall = dbQueryMock.mock.calls.find(
      ([sql]) => /INSERT INTO admin_actions/.test(sql as string),
    );
    expect(auditCall).toBeDefined();
    const details = JSON.parse((auditCall![1] as unknown[])[2] as string);
    expect(details.beforeTitle).toBe('Old Title');
    expect(details.afterTitle).toBe('New Title');
  });

  it('MED-N150 — deletePromotion captures pre-state in audit details', async () => {
    // SELECT FOR UPDATE.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'pr-1', title: 'Doomed Promo', target_audience: 'customer', is_active: true,
      }],
      rowCount: 1,
    });
    // DELETE.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // INSERT admin_actions.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await deletePromotion('pr-1', 'super-1');
    const auditCall = dbQueryMock.mock.calls.find(
      ([sql]) => /INSERT INTO admin_actions/.test(sql as string),
    );
    expect(auditCall).toBeDefined();
    const details = JSON.parse((auditCall![1] as unknown[])[2] as string);
    expect(details.op).toBe('delete');
    expect(details.deletedTitle).toBe('Doomed Promo');
  });
});

describe('MED-N146 — service-area-change verifies provider exists before applying area', () => {
  it('MED-N146 — throws 409 when provider row no longer exists', async () => {
    // SELECT existing change_request.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'sa-1', provider_id: 'user-1', requested_area_id: 'area-2',
        requested_radius_km: 25, status: 'pending',
      }],
      rowCount: 1,
    });
    // UPDATE service_area_change_requests RETURNING.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'sa-1', provider_id: 'user-1', requested_area_id: 'area-2',
        requested_radius_km: 25, status: 'approved',
      }],
      rowCount: 1,
    });
    // SELECT providers — empty (no row).
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(
      decideAreaChange({
        changeId: 'sa-1',
        adminUserId: 'admin-1',
        decision: 'approved',
        reason: 'Approved per policy because area is open',
      }),
    ).rejects.toThrow(/no longer exists/);
  });

  it('MED-N146 — throws 409 when provider is suspended', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'sa-1', provider_id: 'user-1', requested_area_id: 'area-2',
        requested_radius_km: 25, status: 'pending',
      }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'sa-1', provider_id: 'user-1', requested_area_id: 'area-2',
        requested_radius_km: 25, status: 'approved',
      }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'p-1', status: 'suspended' }], rowCount: 1,
    });

    await expect(
      decideAreaChange({
        changeId: 'sa-1',
        adminUserId: 'admin-1',
        decision: 'approved',
        reason: 'Approved per policy because area is open',
      }),
    ).rejects.toThrow(/suspended/);
  });
});
