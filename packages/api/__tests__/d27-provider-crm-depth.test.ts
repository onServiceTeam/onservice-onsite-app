// D27 Phase 7b — provider CRM depth: notes, reminders, templates, insights.

const dbQueryMock = jest.fn();
const clientQueryMock = jest.fn();
const transactionMock = jest.fn(
  async (cb: (c: { query: typeof clientQueryMock }) => unknown) => cb({ query: clientQueryMock }),
);
const sendPushMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...a: unknown[]) => dbQueryMock(...a),
    transaction: (cb: (c: { query: typeof clientQueryMock }) => unknown) => transactionMock(cb),
  },
}));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../src/services/notification.service', () => ({ sendPushNotification: (...a: unknown[]) => sendPushMock(...a) }));

import * as svc from '../src/services/provider-crm.service';

const PROVIDER = 'prov-1';
const CUSTOMER = 'cust-1';

function rows<T>(data: T[]): { rows: T[]; rowCount: number } { return { rows: data, rowCount: data.length }; }

beforeEach(() => { dbQueryMock.mockReset(); clientQueryMock.mockReset(); transactionMock.mockClear(); sendPushMock.mockReset(); });

describe('client notes', () => {
  it('refuses to attach a note to a customer who is not a client', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([{ exists: false }])); // assertIsClient
    await expect(svc.addClientNote(PROVIDER, CUSTOMER, 'hi')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('adds a note for a real client', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([{ exists: true }])); // assertIsClient
    dbQueryMock.mockResolvedValueOnce(rows([{ id: 'n1', provider_id: PROVIDER, customer_id: CUSTOMER, body: 'Prefers mornings', created_at: new Date(), updated_at: new Date() }]));
    const out = await svc.addClientNote(PROVIDER, CUSTOMER, 'Prefers mornings');
    expect(out).toMatchObject({ id: 'n1', customerId: CUSTOMER, body: 'Prefers mornings' });
  });

  it('rejects an empty note before touching the db', async () => {
    await expect(svc.addClientNote(PROVIDER, CUSTOMER, '   ')).rejects.toMatchObject({ statusCode: 400 });
    expect(dbQueryMock).not.toHaveBeenCalled();
  });
});

describe('reminders', () => {
  it('completes a reminder scoped to the provider', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([{ id: 'r1', provider_id: PROVIDER, customer_id: null, title: 'Call back', due_date: new Date('2026-07-01'), status: 'done', fired_at: null, created_at: new Date(), updated_at: new Date() }]));
    const out = await svc.completeReminder(PROVIDER, 'r1');
    expect(out.status).toBe('done');
    // The UPDATE is scoped by provider id (can't complete someone else's reminder).
    expect(dbQueryMock.mock.calls[0][1]).toEqual(['r1', PROVIDER]);
  });

  it('404s completing a reminder that is not the providers', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([]));
    await expect(svc.completeReminder(PROVIDER, 'r9')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('fires due reminders once and notifies the provider user', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([{ id: 'r1', provider_id: PROVIDER, title: 'Follow up with Maria', user_id: 'user-9' }])); // due query
    dbQueryMock.mockResolvedValueOnce(rows([])); // UPDATE fired_at
    const fired = await svc.fireDueReminders();
    expect(fired).toBe(1);
    expect(sendPushMock).toHaveBeenCalledWith('user-9', 'Follow-up reminder', 'Follow up with Maria', 'provider_reminder', { reminderId: 'r1' });
    // Marks fired_at so it won't fire again.
    expect(dbQueryMock.mock.calls[1][0]).toMatch(/SET fired_at = NOW\(\)/);
  });
});

describe('quote templates', () => {
  it('rejects a template with no items', async () => {
    await expect(svc.createTemplate(PROVIDER, { name: 'Aircon clean', items: [] })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('inserts the template and its items in one transaction', async () => {
    clientQueryMock.mockResolvedValueOnce(rows([{ id: 't1', provider_id: PROVIDER, category_id: null, subcategory_id: null, name: 'Aircon clean', created_at: new Date() }]));
    clientQueryMock.mockResolvedValueOnce(rows([])); // items insert
    const out = await svc.createTemplate(PROVIDER, {
      name: 'Aircon clean',
      items: [
        { description: 'Coil clean', quantity: 1, unit: 'unit', unitPrice: 50000, itemType: 'labor' },
        { description: 'Refrigerant', quantity: 1, unit: 'kg', unitPrice: 30000, itemType: 'materials' },
      ],
    });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(clientQueryMock.mock.calls[0][0]).toMatch(/INSERT INTO provider_quote_templates/);
    expect(clientQueryMock.mock.calls[1][0]).toMatch(/INSERT INTO provider_quote_template_items/);
    expect((out.items as unknown[]).length).toBe(2);
  });
});

describe('category insights', () => {
  it('computes completion rate and rounds avg rating', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([
      { category_id: 'cat-1', category_name: 'Aircon', job_count: '10', completed_count: '8', total_value: '500000', avg_rating: '4.75' },
      { category_id: 'cat-2', category_name: 'Plumbing', job_count: '4', completed_count: '4', total_value: '200000', avg_rating: null },
    ]));
    const out = await svc.getCategoryInsights(PROVIDER);
    expect(out[0]).toMatchObject({ categoryName: 'Aircon', jobCount: 10, completedCount: 8, completionRate: 80, avgRating: 4.8 });
    expect(out[1]).toMatchObject({ categoryName: 'Plumbing', completionRate: 100, avgRating: null });
  });
});
