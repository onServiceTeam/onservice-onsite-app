/**
 * D27 Phase 2 — unit tests for the per-subcategory intake field service.
 * Mocks db.query. Covers list (activeOnly filter), create (choice option guard,
 * duplicate-key 409, FK 404), update (404), delete (404).
 */
const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...a: unknown[]) => dbQueryMock(...a) } }));

import * as svc from '../src/services/intake.service';

beforeEach(() => dbQueryMock.mockReset());

function rows<T>(data: T[]): { rows: T[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

const SUBCAT = '11111111-1111-1111-1111-111111111111';
const FIELD = '22222222-2222-2222-2222-222222222222';

function fieldRow(over: Record<string, unknown> = {}) {
  return {
    id: FIELD,
    subcategory_id: SUBCAT,
    field_key: 'area_sqm',
    label: 'Area (sqm)',
    help_text: null,
    field_type: 'number',
    unit: 'sqm',
    options: null,
    placeholder: null,
    is_required: true,
    sort_order: 0,
    is_active: true,
    created_at: new Date('2026-06-29T00:00:00Z'),
    updated_at: new Date('2026-06-29T00:00:00Z'),
    ...over,
  };
}

describe('listIntakeFields', () => {
  it('maps rows and only filters active when asked', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([fieldRow()]));
    const out = await svc.listIntakeFields(SUBCAT, { activeOnly: true });
    expect(out[0]).toMatchObject({ fieldKey: 'area_sqm', fieldType: 'number', unit: 'sqm', isRequired: true });
    expect(dbQueryMock.mock.calls[0][0]).toMatch(/is_active = TRUE/);

    dbQueryMock.mockResolvedValueOnce(rows([fieldRow()]));
    await svc.listIntakeFields(SUBCAT);
    expect(dbQueryMock.mock.calls[1][0]).not.toMatch(/is_active = TRUE/);
  });
});

describe('createIntakeField', () => {
  it('rejects a choice field with fewer than 2 options', async () => {
    await expect(
      svc.createIntakeField(SUBCAT, { fieldKey: 'door', label: 'Door', fieldType: 'choice', options: ['Wood'] }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(dbQueryMock).not.toHaveBeenCalled();
  });

  it('inserts and maps a valid number field', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([fieldRow()]));
    const out = await svc.createIntakeField(SUBCAT, {
      fieldKey: 'area_sqm', label: 'Area (sqm)', fieldType: 'number', unit: 'sqm', isRequired: true,
    });
    expect(out).toMatchObject({ fieldKey: 'area_sqm', unit: 'sqm' });
    expect(dbQueryMock.mock.calls[0][0]).toMatch(/INSERT INTO subcategory_intake_fields/);
  });

  it('maps a duplicate-key error to 409', async () => {
    dbQueryMock.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
    await expect(
      svc.createIntakeField(SUBCAT, { fieldKey: 'area_sqm', label: 'Area', fieldType: 'number' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('maps a missing subcategory (FK) to 404', async () => {
    dbQueryMock.mockRejectedValueOnce(Object.assign(new Error('fk'), { code: '23503' }));
    await expect(
      svc.createIntakeField(SUBCAT, { fieldKey: 'area_sqm', label: 'Area', fieldType: 'number' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('updateIntakeField', () => {
  it('404s when the field is missing', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await expect(svc.updateIntakeField(FIELD, { label: 'New' })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('updates an existing field', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([fieldRow()])) // existing lookup
      .mockResolvedValueOnce(rows([fieldRow({ label: 'New label' })])); // update returning
    const out = await svc.updateIntakeField(FIELD, { label: 'New label' });
    expect(out.label).toBe('New label');
  });
});

describe('deleteIntakeField', () => {
  it('404s when nothing was deleted', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(svc.deleteIntakeField(FIELD)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('deletes an existing field', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await expect(svc.deleteIntakeField(FIELD)).resolves.toBeUndefined();
  });
});
