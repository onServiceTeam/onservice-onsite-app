// 2026-10-12: the page half of this test (loading legal/feedback.html and
// checking its field limits) was retired. The v1 feedback page it checked was
// replaced that day by the v2 study page, whose limits are enforced by the v2
// API tests (feedback-study-postgres.test.ts) and whose behaviour is covered by
// feedback-v2-page.dom.test.ts. The v1 service limits below still apply to the
// old /api/v1/feedback intake and stay tested here.

jest.mock('../src/config/database.config', () => ({
  pool: { query: jest.fn() },
}));

import { validateAndNormalize } from '../src/services/feedback.service';

it('Bug UX-879 — tester feedback exposes its text limits and rejects overflow instead of storing truncated research', () => {
  const tooLongAnswer = validateAndNormalize({
    answers: { 'customer:worst': 'x'.repeat(2_001) },
  });
  expect(tooLongAnswer).toEqual(expect.objectContaining({
    ok: false,
    spam: false,
    reason: expect.stringMatching(/Answers field.*2,000 characters or fewer/i),
  }));

  const tooLongIssue = validateAndNormalize({
    items: [{ what: 'x'.repeat(3_001) }],
  });
  expect(tooLongIssue).toEqual(expect.objectContaining({
    ok: false,
    spam: false,
    reason: expect.stringMatching(/Issue 1 description.*3,000 characters or fewer/i),
  }));

  const tooLongIdeas = validateAndNormalize({ ideas: 'x'.repeat(10_001) });
  expect(tooLongIdeas).toEqual(expect.objectContaining({
    ok: false,
    spam: false,
    reason: 'Additional ideas must be 10,000 characters or fewer.',
  }));

  const tooManyItems = validateAndNormalize({
    items: Array.from({ length: 51 }, (_, index) => ({ what: `Issue ${index}` })),
  });
  expect(tooManyItems).toEqual(expect.objectContaining({
    ok: false,
    spam: false,
    reason: 'Issue details can contain at most 50 items.',
  }));

  const tooManyAnswers = validateAndNormalize({
    answers: Object.fromEntries(Array.from({ length: 201 }, (_, index) => [`answer-${index}`, 'useful'])),
  });
  expect(tooManyAnswers).toEqual(expect.objectContaining({
    ok: false,
    spam: false,
    reason: 'Answers can contain at most 200 fields.',
  }));

  const exact = 'x'.repeat(2_000);
  const accepted = validateAndNormalize({ answers: { 'customer:worst': exact } });
  expect(accepted.ok).toBe(true);
  if (accepted.ok) {
    expect((accepted.value.payload.answers as Record<string, string>)['customer:worst']).toBe(exact);
  }
});
