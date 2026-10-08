import request from 'supertest';
import { approveProvider } from '../src/services/admin.service';
import { draftIntegrationIt as it } from './helpers/provider-draft-postgres';
import { approvalReview } from './helpers/provider-approval-postgres';
import { reviewCredential, revisionReviewerId, revisionReviewApp } from './helpers/provider-revision-review-postgres';
import { withDecisionDatabase } from './helpers/provider-decision-postgres';

jest.mock('../src/services/settings.service', () => ({ getMaxProviderServiceRadiusKm: jest.fn().mockResolvedValue(50) }));

it('Bug OPS-516 — private submission reads expose the actual recorded decision and fail closed when its schema is unavailable', async () => {
  await withDecisionDatabase(async ({ database, providerId, revisionId }) => {
    const app = revisionReviewApp();
    const get = () => request(app).get(`/api/v1/admin/providers/${providerId}/application-revisions/${revisionId}`)
      .auth(reviewCredential(), { type: 'bearer' });
    const before = await get();
    expect(before.status).toBe(200);
    expect(before.body.data.decisionContractVersion).toBe(1);
    expect(before.body.data.decision).toBeNull();
    await approveProvider(providerId, revisionReviewerId, { ...approvalReview, expectedRevisionId: revisionId });
    const saved = (await database.query('SELECT * FROM provider_application_decisions')).rows[0];
    // Operational status can subsequently change without changing the recorded decision.
    await database.query("UPDATE providers SET status='suspended' WHERE id=$1", [providerId]);
    const after = await get();
    expect(after.status).toBe(200);
    expect(after.headers['cache-control']).toBe('private, no-store');
    expect(after.body.data.currentStatus).toBe('suspended');
    expect(after.body.data.revision).toEqual(before.body.data.revision);
    expect(after.body.data.decision).toEqual({ id: saved.id, decision: 'approved', decidedBy: revisionReviewerId,
      reason: approvalReview.reason, checklistSummary: approvalReview.checklistSummary, decidedAt: saved.decided_at.toISOString() });
    await database.query('ALTER TABLE provider_application_decisions RENAME TO unavailable_decisions');
    const unavailable = await get();
    expect(unavailable.status).toBe(503);
    expect(unavailable.body.error.code).toBe('provider_application_schema_unavailable');
    expect(unavailable.headers['cache-control']).toBe('private, no-store');
    expect(JSON.stringify(unavailable.body)).not.toContain('unavailable_decisions');
  });
  await withDecisionDatabase(async ({ database, providerId, revisionId }) => {
    await database.query('ALTER TABLE provider_application_decisions RENAME TO unavailable_decisions');
    await expect(approveProvider(providerId, revisionReviewerId, { ...approvalReview, expectedRevisionId: revisionId }))
      .rejects.toMatchObject({ statusCode: 503, code: 'provider_application_schema_unavailable' });
    expect((await database.query('SELECT status,reviewed_at FROM providers WHERE id=$1', [providerId])).rows)
      .toEqual([{ status: 'pending', reviewed_at: null }]);
    expect((await database.query('SELECT * FROM admin_actions')).rows).toEqual([]);
  });
}, 30000);
