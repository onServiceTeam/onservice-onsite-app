// D27 Phase 5 — project layer service tests.
//
// Covers: create (title required), list scoping (customer vs provider vs admin),
// detail authorization (stranger gets 404, not 403, so existence isn't leaked),
// and milestone update rules (assigned provider is status-only; completing a
// milestone stamps completed_at).

const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...a: unknown[]) => dbQueryMock(...a) } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import * as svc from '../src/services/project.service';

const CUSTOMER = 'cust-1';
const OTHER_CUSTOMER = 'cust-2';
const PROVIDER_USER = 'pu-1';
const PROVIDER_ID = 'prov-1';
const PROJECT_ID = 'proj-1';
const MILESTONE_ID = 'ms-1';

function rows<T>(data: T[]): { rows: T[]; rowCount: number } {
  return { rows: data, rowCount: data.length };
}

function projectRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PROJECT_ID, customer_id: CUSTOMER, provider_id: null, category_id: null,
    title: 'New kitchen', description: '', address: null, city: null, status: 'planning',
    estimated_total: null, created_at: new Date('2026-06-29'), updated_at: new Date('2026-06-29'),
    ...over,
  };
}

beforeEach(() => dbQueryMock.mockReset());

describe('createProject', () => {
  it('requires a title', async () => {
    await expect(svc.createProject({ userId: CUSTOMER, role: 'customer' }, { title: '   ' })).rejects.toMatchObject({ statusCode: 400 });
    expect(dbQueryMock).not.toHaveBeenCalled();
  });

  it('inserts and returns the project owned by the customer', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([projectRow()]));
    const out = await svc.createProject({ userId: CUSTOMER, role: 'customer' }, { title: 'New kitchen' });
    expect(out).toMatchObject({ id: PROJECT_ID, customerId: CUSTOMER, status: 'planning' });
    expect(dbQueryMock.mock.calls[0][0]).toMatch(/INSERT INTO projects/);
  });

  it('Bug SEC-012 — a provider cannot create a project row owned by their user account', async () => {
    await expect(
      svc.createProject({ userId: PROVIDER_USER, role: 'provider' }, { title: 'Private project' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(dbQueryMock).not.toHaveBeenCalled();
  });
});

describe('updateProject assignment rules', () => {
  it('Bug SEC-013 — a customer cannot expose a project by assigning an arbitrary provider UUID', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([projectRow()]));

    await expect(
      svc.updateProject(
        PROJECT_ID,
        { userId: CUSTOMER, role: 'customer' },
        { providerId: PROVIDER_ID },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(dbQueryMock).toHaveBeenCalledTimes(1);
  });
});

describe('listProjects scoping', () => {
  it('a plain customer only sees their own projects', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([])); // providerIdForUser -> not a provider
    dbQueryMock.mockResolvedValueOnce(rows([projectRow()]));
    await svc.listProjects({ userId: CUSTOMER, role: 'customer' });
    const listSql = dbQueryMock.mock.calls[1][0];
    expect(listSql).toMatch(/WHERE p\.customer_id = \$1/);
    expect(listSql).not.toMatch(/OR p\.provider_id/);
  });

  it('a provider sees projects they own or are assigned to', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([{ id: PROVIDER_ID }])); // providerIdForUser
    dbQueryMock.mockResolvedValueOnce(rows([projectRow({ provider_id: PROVIDER_ID })]));
    await svc.listProjects({ userId: PROVIDER_USER, role: 'provider' });
    expect(dbQueryMock.mock.calls[1][0]).toMatch(/WHERE \(p\.customer_id = \$1 OR p\.provider_id = \$2\)/);
  });

  it('an admin lists all projects without an owner filter', async () => {
    dbQueryMock.mockResolvedValueOnce(rows([projectRow()]));
    await svc.listProjects({ userId: 'admin-1', role: 'admin' });
    // No providerIdForUser lookup for admins; first call is the project list.
    expect(dbQueryMock.mock.calls[0][0]).toMatch(/FROM projects/);
    expect(dbQueryMock.mock.calls[0][0]).not.toMatch(/customer_id = /);
  });
});

describe('getProjectDetail authorization', () => {
  it('hides a project from an unrelated customer with a 404 (not 403)', async () => {
    // project owned by someone else, no provider assigned.
    dbQueryMock.mockResolvedValueOnce(rows([projectRow({ customer_id: OTHER_CUSTOMER, provider_id: null })]));
    await expect(
      svc.getProjectDetail(PROJECT_ID, { userId: CUSTOMER, role: 'customer' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns the project with its children for the owner', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([projectRow()])) // loadProjectForRequester
      .mockResolvedValueOnce(rows([{ id: MILESTONE_ID, project_id: PROJECT_ID, title: 'Demolition', description: '', sort_order: 0, status: 'pending', amount: null, target_date: null, completed_at: null, created_at: new Date(), updated_at: new Date() }]))
      .mockResolvedValueOnce(rows([{ id: 'sel-1', project_id: PROJECT_ID, category: 'Door', label: 'Material', value: 'Oak', detail: null, sort_order: 0, created_at: new Date() }]))
      .mockResolvedValueOnce(rows([{ id: 'doc-1', project_id: PROJECT_ID, label: 'Blueprint', file_url: 'https://x/bp.pdf', doc_type: 'blueprint', uploaded_by: CUSTOMER, created_at: new Date() }]));

    const out = await svc.getProjectDetail(PROJECT_ID, { userId: CUSTOMER, role: 'customer' });
    expect((out.milestones as unknown[]).length).toBe(1);
    expect((out.selections as unknown[])[0]).toMatchObject({ category: 'Door', value: 'Oak' });
    expect((out.documents as unknown[])[0]).toMatchObject({ docType: 'blueprint' });
  });
});

describe('updateMilestone rules', () => {
  it('blocks an assigned provider from changing the amount (status-only)', async () => {
    // milestone+project join: project owned by another customer, assigned to PROVIDER_ID.
    dbQueryMock
      .mockResolvedValueOnce(rows([{ id: MILESTONE_ID, project_id: PROJECT_ID, title: 'X', description: '', sort_order: 0, status: 'pending', amount: null, target_date: null, completed_at: null, created_at: new Date(), updated_at: new Date(), p_customer: OTHER_CUSTOMER, p_provider: PROVIDER_ID }])
      )
      .mockResolvedValueOnce(rows([projectRow({ customer_id: OTHER_CUSTOMER, provider_id: PROVIDER_ID })])) // loadProjectForRequester project SELECT
      .mockResolvedValueOnce(rows([{ id: PROVIDER_ID }])); // providerIdForUser matches -> authorized

    await expect(
      svc.updateMilestone(MILESTONE_ID, { userId: PROVIDER_USER, role: 'provider' }, { amount: 50000 }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('stamps completed_at when the owner completes a milestone', async () => {
    dbQueryMock
      .mockResolvedValueOnce(rows([{ id: MILESTONE_ID, project_id: PROJECT_ID, title: 'X', description: '', sort_order: 0, status: 'in_progress', amount: null, target_date: null, completed_at: null, created_at: new Date(), updated_at: new Date(), p_customer: CUSTOMER, p_provider: null }])
      )
      .mockResolvedValueOnce(rows([projectRow()])) // loadProjectForRequester (owner)
      .mockResolvedValueOnce(rows([{ id: MILESTONE_ID, project_id: PROJECT_ID, title: 'X', description: '', sort_order: 0, status: 'completed', amount: null, target_date: null, completed_at: new Date('2026-06-29'), created_at: new Date(), updated_at: new Date() }]));

    const out = await svc.updateMilestone(MILESTONE_ID, { userId: CUSTOMER, role: 'customer' }, { status: 'completed' });
    const updateCall = dbQueryMock.mock.calls.find((c) => /UPDATE project_milestones/.test(c[0]))!;
    expect(updateCall[0]).toMatch(/completed_at = /);
    // completed_at param is a real Date when completing.
    expect(updateCall[1].some((p: unknown) => p instanceof Date)).toBe(true);
    expect(out.status).toBe('completed');
    expect(out.completedAt).not.toBeNull();
  });
});
