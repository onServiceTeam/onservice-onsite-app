// Phase 14 Dispatch 09 — Bugs 162, 1199, 1200.
// provider-onboarding.service tests.

jest.mock('../../src/models/db', () => {
  const helper = jest.requireActual('../helpers/d06-tx-mock') as typeof import('../helpers/d06-tx-mock');
  return helper.createDbMock();
});

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import * as svc from '../../src/services/provider-onboarding.service';
import {
  resetDbMock,
  setTopQueryImpl,
  setTxQueryImpl,
  makeRouter,
  getTxCalls,
} from '../helpers/d06-tx-mock';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ID = '22222222-2222-2222-2222-222222222222';

beforeEach(resetDbMock);

describe('Bug 1200 — trackProgress (resumable)', () => {
  it('creates a new progress row on first step', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT \* FROM provider_onboarding_progress WHERE user_id = \$1 FOR UPDATE/, rows: [], rowCount: 0 },
      { match: /INSERT INTO provider_onboarding_progress/, rows: [{
        user_id: USER_ID,
        current_step: 'role_select',
        steps_completed: ['role_select'],
        data_snapshot: { role_select: { role: 'provider' } },
        submitted_for_review_at: null,
        admin_review_started_at: null,
        admin_reviewer_id: null,
        admin_decision: null,
        admin_decision_at: null,
        admin_decision_reason: null,
        estimated_review_hours: 72,
        created_at: new Date(),
        updated_at: new Date(),
      }], rowCount: 1 },
    ]));

    const result = await svc.trackProgress(USER_ID, 'role_select', { role: 'provider' });
    expect(result.currentStep).toBe('role_select');
    expect(result.isEditable).toBe(true);
  });

  it('appends step to existing row + accumulates data_snapshot', async () => {
    const now = new Date();
    setTxQueryImpl(makeRouter([
      { match: /SELECT \* FROM provider_onboarding_progress/, rows: [{
        user_id: USER_ID,
        current_step: 'role_select',
        steps_completed: ['role_select'],
        data_snapshot: { role_select: { role: 'provider' } },
        submitted_for_review_at: null,
        admin_review_started_at: null,
        admin_reviewer_id: null,
        admin_decision: null,
        admin_decision_at: null,
        admin_decision_reason: null,
        estimated_review_hours: 72,
        created_at: now,
        updated_at: now,
      }], rowCount: 1 },
      { match: /UPDATE provider_onboarding_progress/, rows: [{
        user_id: USER_ID,
        current_step: 'terms',
        steps_completed: ['role_select', 'terms'],
        data_snapshot: { role_select: { role: 'provider' }, terms: { acceptedAt: now } },
        submitted_for_review_at: null,
        admin_review_started_at: null,
        admin_reviewer_id: null,
        admin_decision: null,
        admin_decision_at: null,
        admin_decision_reason: null,
        estimated_review_hours: 72,
        created_at: now,
        updated_at: now,
      }], rowCount: 1 },
    ]));

    const result = await svc.trackProgress(USER_ID, 'terms', { acceptedAt: now });
    expect(result.currentStep).toBe('terms');
    expect(result.stepsCompleted).toContain('role_select');
    expect(result.stepsCompleted).toContain('terms');
  });

  it('rejects edits when application is locked under review (Bug 1200)', async () => {
    const now = new Date();
    setTxQueryImpl(makeRouter([
      { match: /SELECT \* FROM provider_onboarding_progress/, rows: [{
        user_id: USER_ID,
        current_step: 'review_pending',
        steps_completed: ['role_select', 'terms', 'categories', 'service_area', 'documents', 'selfie'],
        data_snapshot: {},
        submitted_for_review_at: now,
        admin_review_started_at: null,
        admin_reviewer_id: null,
        admin_decision: null,
        admin_decision_at: null,
        admin_decision_reason: null,
        estimated_review_hours: 72,
        created_at: now,
        updated_at: now,
      }], rowCount: 1 },
    ]));

    await expect(
      svc.trackProgress(USER_ID, 'documents', { document: 'foo' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('allows edits when admin sent it back (Bug 1200 unlock)', async () => {
    const now = new Date();
    setTxQueryImpl(makeRouter([
      { match: /SELECT \* FROM provider_onboarding_progress/, rows: [{
        user_id: USER_ID,
        current_step: 'documents',
        steps_completed: ['role_select', 'terms', 'categories', 'service_area', 'documents', 'selfie'],
        data_snapshot: {},
        submitted_for_review_at: now,
        admin_review_started_at: now,
        admin_reviewer_id: ADMIN_ID,
        admin_decision: 'sent_back',
        admin_decision_at: now,
        admin_decision_reason: 'NBI clearance is blurry',
        estimated_review_hours: 72,
        created_at: now,
        updated_at: now,
      }], rowCount: 1 },
      { match: /UPDATE provider_onboarding_progress/, rows: [{
        user_id: USER_ID,
        current_step: 'documents',
        steps_completed: ['role_select', 'terms', 'categories', 'service_area', 'documents', 'selfie'],
        data_snapshot: { documents: { newNbi: 'foo' } },
        submitted_for_review_at: now,
        admin_review_started_at: now,
        admin_reviewer_id: ADMIN_ID,
        admin_decision: 'sent_back',
        admin_decision_at: now,
        admin_decision_reason: 'NBI clearance is blurry',
        estimated_review_hours: 72,
        created_at: now,
        updated_at: now,
      }], rowCount: 1 },
    ]));

    const result = await svc.trackProgress(USER_ID, 'documents', { newNbi: 'foo' });
    expect(result.adminDecision).toBe('sent_back');
    expect(result.isEditable).toBe(true);
  });
});

describe('Bug 162 + 1199 — submitForReview', () => {
  it('locks application + sets review_pending + writes audit', async () => {
    const now = new Date();
    setTxQueryImpl(makeRouter([
      { match: /SELECT \* FROM provider_onboarding_progress/, rows: [{
        user_id: USER_ID,
        current_step: 'selfie',
        steps_completed: ['role_select', 'terms', 'categories', 'service_area', 'documents', 'selfie'],
        data_snapshot: {},
        submitted_for_review_at: null,
        admin_review_started_at: null,
        admin_reviewer_id: null,
        admin_decision: null,
        admin_decision_at: null,
        admin_decision_reason: null,
        estimated_review_hours: 72,
        created_at: now,
        updated_at: now,
      }], rowCount: 1 },
      { match: /UPDATE provider_onboarding_progress[\s\S]*review_pending/, rows: [{
        user_id: USER_ID,
        current_step: 'review_pending',
        steps_completed: ['role_select', 'terms', 'categories', 'service_area', 'documents', 'selfie'],
        data_snapshot: {},
        submitted_for_review_at: now,
        admin_review_started_at: null,
        admin_reviewer_id: null,
        admin_decision: null,
        admin_decision_at: null,
        admin_decision_reason: null,
        estimated_review_hours: 72,
        created_at: now,
        updated_at: now,
      }], rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rowCount: 1 },
    ]));

    const result = await svc.submitForReview(USER_ID);
    expect(result.currentStep).toBe('review_pending');
    expect(result.submittedForReviewAt).toBeDefined();
    expect(result.estimatedDecisionAt).toBeDefined();
    expect(result.isEditable).toBe(false);

    const audit = getTxCalls().find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(audit!.sql).toContain("'provider_application_submitted'");
  });

  it('rejects 400 when required steps not completed', async () => {
    const now = new Date();
    setTxQueryImpl(makeRouter([
      { match: /SELECT \* FROM provider_onboarding_progress/, rows: [{
        user_id: USER_ID,
        current_step: 'documents',
        steps_completed: ['role_select', 'terms'],
        data_snapshot: {},
        submitted_for_review_at: null,
        admin_review_started_at: null,
        admin_reviewer_id: null,
        admin_decision: null,
        admin_decision_at: null,
        admin_decision_reason: null,
        estimated_review_hours: 72,
        created_at: now,
        updated_at: now,
      }], rowCount: 1 },
    ]));

    await expect(svc.submitForReview(USER_ID)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('Bug 162 — adminDecide', () => {
  it('approved decision moves to completed + writes audit', async () => {
    const now = new Date();
    setTxQueryImpl(makeRouter([
      { match: /SELECT \* FROM provider_onboarding_progress/, rows: [{
        user_id: USER_ID,
        current_step: 'review_pending',
        steps_completed: ['role_select', 'terms', 'categories', 'service_area', 'documents', 'selfie'],
        data_snapshot: {},
        submitted_for_review_at: now,
        admin_review_started_at: null,
        admin_reviewer_id: null,
        admin_decision: null,
        admin_decision_at: null,
        admin_decision_reason: null,
        estimated_review_hours: 72,
        created_at: now,
        updated_at: now,
      }], rowCount: 1 },
      { match: /UPDATE provider_onboarding_progress\s+SET admin_decision/, rows: [{
        user_id: USER_ID,
        current_step: 'completed',
        steps_completed: ['role_select', 'terms', 'categories', 'service_area', 'documents', 'selfie'],
        data_snapshot: {},
        submitted_for_review_at: now,
        admin_review_started_at: now,
        admin_reviewer_id: ADMIN_ID,
        admin_decision: 'approved',
        admin_decision_at: now,
        admin_decision_reason: 'Documents verified, selfie matches ID, NBI clean.',
        estimated_review_hours: 72,
        created_at: now,
        updated_at: now,
      }], rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rowCount: 1 },
    ]));

    const result = await svc.adminDecide({
      userId: USER_ID,
      adminUserId: ADMIN_ID,
      decision: 'approved',
      reason: 'Documents verified, selfie matches ID, NBI clean.',
    });

    expect(result.adminDecision).toBe('approved');
    expect(result.currentStep).toBe('completed');

    const audit = getTxCalls().find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(audit).toBeDefined();
    expect(audit!.params[1]).toBe('provider_application_approved');
  });

  it('rejects decision reason < 30 chars', async () => {
    await expect(
      svc.adminDecide({
        userId: USER_ID,
        adminUserId: ADMIN_ID,
        decision: 'approved',
        reason: 'short',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('sent_back unlocks editing for provider (Bug 1200 path)', async () => {
    const now = new Date();
    setTxQueryImpl(makeRouter([
      { match: /SELECT \* FROM provider_onboarding_progress/, rows: [{
        user_id: USER_ID,
        current_step: 'review_pending',
        steps_completed: ['role_select', 'terms', 'categories', 'service_area', 'documents', 'selfie'],
        data_snapshot: {},
        submitted_for_review_at: now,
        admin_review_started_at: null,
        admin_reviewer_id: null,
        admin_decision: null,
        admin_decision_at: null,
        admin_decision_reason: null,
        estimated_review_hours: 72,
        created_at: now,
        updated_at: now,
      }], rowCount: 1 },
      { match: /UPDATE provider_onboarding_progress/, rows: [{
        user_id: USER_ID,
        current_step: 'review_pending',
        steps_completed: ['role_select', 'terms', 'categories', 'service_area', 'documents', 'selfie'],
        data_snapshot: {},
        submitted_for_review_at: now,
        admin_review_started_at: now,
        admin_reviewer_id: ADMIN_ID,
        admin_decision: 'sent_back',
        admin_decision_at: now,
        admin_decision_reason: 'NBI clearance image is blurry — please re-upload a clearer scan.',
        estimated_review_hours: 72,
        created_at: now,
        updated_at: now,
      }], rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rowCount: 1 },
    ]));

    const result = await svc.adminDecide({
      userId: USER_ID,
      adminUserId: ADMIN_ID,
      decision: 'sent_back',
      reason: 'NBI clearance image is blurry — please re-upload a clearer scan.',
    });

    expect(result.adminDecision).toBe('sent_back');
    expect(result.isEditable).toBe(true);
  });
});

describe('Bug 1199 — getProgress returns timeline', () => {
  it('computes estimatedDecisionAt for submitted applications', async () => {
    const submittedAt = new Date('2026-04-30T08:00:00Z');
    setTopQueryImpl(makeRouter([
      { match: /SELECT \* FROM provider_onboarding_progress WHERE user_id = \$1$/, rows: [{
        user_id: USER_ID,
        current_step: 'review_pending',
        steps_completed: ['role_select', 'terms', 'categories', 'service_area', 'documents', 'selfie'],
        data_snapshot: {},
        submitted_for_review_at: submittedAt,
        admin_review_started_at: null,
        admin_reviewer_id: null,
        admin_decision: null,
        admin_decision_at: null,
        admin_decision_reason: null,
        estimated_review_hours: 72,
        created_at: submittedAt,
        updated_at: submittedAt,
      }], rowCount: 1 },
    ]));

    const result = await svc.getProgress(USER_ID);
    expect(result).not.toBeNull();
    // 72h after submission.
    expect(new Date(result!.estimatedDecisionAt!).getTime() - submittedAt.getTime())
      .toBe(72 * 3_600_000);
  });
});
