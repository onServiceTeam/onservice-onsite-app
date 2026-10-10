const mockSaveArtifact = jest.fn();
jest.mock('../src/services/upload.service', () => ({
  ...jest.requireActual('../src/services/upload.service'),
  savePrivateArtifact: (...args: unknown[]) => mockSaveArtifact(...args),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { db } from '../src/models/db';
import { gatherUserData, processDataExport } from '../src/services/data-management.service';
import { saveApplicationDraft } from '../src/services/provider-application-draft.service';
import { draftIntegrationIt, withDraftDatabase, draftOwner, otherDraftOwner, expireDraft } from './helpers/provider-draft-postgres';

const retainedDraft = {
  revision: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  application_fields: { businessName: 'Applicant fixture', governmentIdFrontUrl: `onboarding/${draftOwner}/id-front.jpg` },
  created_at: new Date('2026-08-01T00:00:00Z'), saved_at: new Date('2026-08-02T00:00:00Z'),
  expires_at: new Date('2026-09-01T00:00:00Z'), expired: true,
};

beforeEach(() => mockSaveArtifact.mockReset());
afterEach(() => jest.restoreAllMocks());

it('Bug OPS-501 — the account archive persists its retained unsubmitted provider draft in both JSON and CSV', async () => {
  for (const format of ['json', 'csv']) {
    const exportId = `fixture-export-${format}`;
    const query = jest.spyOn(db, 'query').mockImplementation(async (sql: string) => {
      if (sql.includes("SET status = 'processing'")) return { rows: [{ id: exportId, user_id: draftOwner, format }], rowCount: 1 };
      if (sql.includes('FROM provider_application_drafts')) return { rows: [retainedDraft], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const key = `private-artifacts/data-exports/${draftOwner}/${exportId}.${format}`;
    mockSaveArtifact.mockResolvedValue(key);
    await processDataExport(exportId);
    const [buffer, storedKey, contentType] = mockSaveArtifact.mock.calls.at(-1)!;
    expect(storedKey).toBe(key);
    expect(contentType).toBe(format === 'json' ? 'application/json' : 'text/csv');
    const bytes = (buffer as Buffer).toString('utf8');
    if (format === 'json') {
      expect(JSON.parse(bytes).providerApplicationDraft).toEqual(JSON.parse(JSON.stringify(retainedDraft)));
    } else {
      expect(bytes).toContain('--- providerApplicationDraft ---');
      expect(bytes).toContain('Applicant fixture');
      expect(bytes).toContain(retainedDraft.application_fields.governmentIdFrontUrl);
    }
    expect(bytes).not.toMatch(/https?:\/\/.*onboarding/);
    expect(query.mock.calls.some(call => String(call[0]).includes("SET status = 'completed'"))).toBe(true);
    query.mockRestore();
  }
});

it('a failed draft read fails the archive rather than saving an apparently complete partial export', async () => {
  const query = jest.spyOn(db, 'query').mockImplementation(async (sql: string) => {
    if (sql.includes("SET status = 'processing'")) return { rows: [{ id: 'fixture-export', user_id: draftOwner, format: 'json' }], rowCount: 1 };
    if (sql.includes('FROM provider_application_drafts')) throw new Error('Fixture draft read unavailable');
    return { rows: [], rowCount: 0 };
  });
  await processDataExport('fixture-export');
  expect(mockSaveArtifact).not.toHaveBeenCalled();
  const updates = query.mock.calls.filter(call => String(call[0]).includes('UPDATE data_export_requests'));
  expect(updates).toHaveLength(2);
  expect(updates[1]?.[1]).toEqual(['fixture-export', 'Fixture draft read unavailable', null]);
});

draftIntegrationIt('draft export executes the real owner-scoped SQL, includes retained expired data, and never renews or changes it', async () => {
  await withDraftDatabase(async database => {
    await saveApplicationDraft(draftOwner, { expectedRevision: null, fields: { businessName: 'First applicant' } });
    await saveApplicationDraft(otherDraftOwner, { expectedRevision: null, fields: { businessName: 'Other applicant' } });
    await expireDraft(database);
    // A changed role/activity flag must not hide data still held in an owner's
    // privacy archive. This is not the resumable draft API or admin review.
    await database.query("UPDATE users SET is_active=FALSE WHERE id=$1", [draftOwner]);
    const before = (await database.query('SELECT * FROM provider_application_drafts ORDER BY user_id')).rows;
    const actualQuery = db.query.bind(db);
    // Only this section uses real PostgreSQL. Other archive sections are empty
    // fixtures; their schemas/joins and download authorization are not proved here.
    jest.spyOn(db, 'query').mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM provider_application_drafts')) return actualQuery(sql, params);
      return { rows: [], rowCount: 0 };
    });
    for (const [owner, name, expired] of [[draftOwner, 'First applicant', true], [otherDraftOwner, 'Other applicant', false]] as const) {
      const archive = await gatherUserData(owner);
      expect(archive.providerApplicationDraft).toEqual(expect.objectContaining({
        application_fields: expect.objectContaining({ businessName: name }), expired,
      }));
      expect(JSON.stringify(archive)).not.toContain(owner === draftOwner ? 'Other applicant' : 'First applicant');
    }
    expect((await gatherUserData('dddddddd-dddd-4ddd-8ddd-dddddddddddd')).providerApplicationDraft).toBeNull();
    expect((await database.query('SELECT * FROM provider_application_drafts ORDER BY user_id')).rows).toEqual(before);
  });
}, 30000);
