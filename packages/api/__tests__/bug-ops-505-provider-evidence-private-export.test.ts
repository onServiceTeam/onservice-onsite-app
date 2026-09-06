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
import { createProviderApplication } from '../src/services/provider.service';
import { draftIntegrationIt } from './helpers/provider-draft-postgres';
import { applicantId, submissionInput, withSubmissionDatabase } from './helpers/provider-submission-postgres';

const evidence = { id: 'fixture-revision', revision_number: 1, business_name: 'Original applicant',
  government_id_front_key: `onboarding/${applicantId}/original.jpg`, category_names: ['Cleaning'] };

beforeEach(() => mockSaveArtifact.mockReset());
afterEach(() => jest.restoreAllMocks());

it('Bug OPS-505 — the private JSON and CSV account artifacts include retained submitted application evidence', async () => {
  for (const format of ['json', 'csv']) {
    const exportId = `fixture-${format}`;
    const query = jest.spyOn(db, 'query').mockImplementation(async (sql: string) => {
      if (sql.includes("SET status = 'processing'")) return { rows: [{ id: exportId, user_id: applicantId, format }], rowCount: 1 };
      if (sql.includes('FROM provider_application_revisions')) return { rows: [evidence], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const key = `private-artifacts/data-exports/${applicantId}/${exportId}.${format}`;
    mockSaveArtifact.mockResolvedValue(key);
    await processDataExport(exportId);
    const [buffer, objectKey, contentType] = mockSaveArtifact.mock.calls.at(-1)!;
    expect(objectKey).toBe(key);
    expect(contentType).toBe(format === 'json' ? 'application/json' : 'text/csv');
    const bytes = (buffer as Buffer).toString('utf8');
    if (format === 'json') expect(JSON.parse(bytes).providerApplicationRevisions).toEqual([evidence]);
    else {
      expect(bytes).toContain('--- providerApplicationRevisions ---');
      expect(bytes).toContain('Original applicant');
      expect(bytes).toContain(evidence.government_id_front_key);
    }
    expect(bytes).not.toMatch(/https?:\/\/.*onboarding/);
    expect(query.mock.calls.some(call => String(call[0]).includes("SET status = 'completed'"))).toBe(true);
    query.mockRestore();
  }
});

it('an evidence-read failure prevents publication of a partial private archive', async () => {
  const query = jest.spyOn(db, 'query').mockImplementation(async (sql: string) => {
    if (sql.includes("SET status = 'processing'")) return { rows: [{ id: 'fixture-export', user_id: applicantId, format: 'json' }], rowCount: 1 };
    if (sql.includes('FROM provider_application_revisions')) throw new Error('Fixture evidence unavailable');
    return { rows: [], rowCount: 0 };
  });
  await processDataExport('fixture-export');
  expect(mockSaveArtifact).not.toHaveBeenCalled();
  const updates = query.mock.calls.filter(call => String(call[0]).includes('UPDATE data_export_requests'));
  expect(updates).toHaveLength(2);
  expect(updates[1]?.[1]).toEqual(['fixture-export', 'Fixture evidence unavailable', null]);
});

draftIntegrationIt('the actual retained-evidence export query isolates the submitting owner and does not depend on current role or eligibility', async () => {
  await withSubmissionDatabase(async database => {
    const other = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    await database.query("INSERT INTO users (id,role) VALUES ($1,'customer')", [other]);
    await createProviderApplication(applicantId, submissionInput);
    await createProviderApplication(other, { ...submissionInput, businessName: 'Other applicant',
      governmentIdFrontUrl: `onboarding/${other}/front.jpg`, governmentIdBackUrl: `onboarding/${other}/back.jpg`,
      nbiClearanceUrl: `onboarding/${other}/nbi.jpg`, selfieUrl: `onboarding/${other}/selfie.jpg`,
    });
    await database.query("UPDATE users SET is_active=FALSE WHERE id=$1", [applicantId]);
    await database.query("UPDATE providers SET business_name='Changed current profile',years_experience=12 WHERE user_id=$1", [applicantId]);
    const before = (await database.query('SELECT * FROM provider_application_revisions ORDER BY submitted_by,id')).rows;
    const realQuery = db.query.bind(db);
    // This projection alone executes on real PostgreSQL. Other seventeen
    // archive sections are empty fixtures, not a full export/download test.
    jest.spyOn(db, 'query').mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM provider_application_revisions')) return realQuery(sql, params);
      return { rows: [], rowCount: 0 };
    });
    for (const [owner, name] of [[applicantId, submissionInput.businessName], [other, 'Other applicant']] as const) {
      const archive = await gatherUserData(owner);
      expect(archive.providerApplicationRevisions).toEqual([expect.objectContaining({
        submitted_by: owner, business_name: name, revision_number: 1, years_experience: 5, nbi_expiry_date: '2028-02-29',
      })]);
      expect(JSON.stringify(archive.providerApplicationRevisions)).not.toContain(owner === applicantId ? other : applicantId);
    }
    expect((await gatherUserData('dddddddd-dddd-4ddd-8ddd-dddddddddddd')).providerApplicationRevisions).toEqual([]);
    expect((await database.query('SELECT * FROM provider_application_revisions ORDER BY submitted_by,id')).rows).toEqual(before);
  });
}, 30000);
