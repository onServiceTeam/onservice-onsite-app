import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

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

  const html = readFileSync(path.resolve(__dirname, '../../..', 'legal', 'feedback.html'), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://app.onservice.ph/feedback',
    beforeParse(window) {
      Object.defineProperty(window, 'scrollTo', { value: jest.fn(), configurable: true });
    },
  });

  try {
    expect(dom.window.document.querySelector('[name="testerName"]')?.getAttribute('maxlength')).toBe('200');
    expect(dom.window.document.querySelector('[name="testerContact"]')?.getAttribute('maxlength')).toBe('200');
    expect(dom.window.document.querySelector('[name="ideas"]')?.getAttribute('maxlength')).toBe('10000');
    for (const field of dom.window.document.querySelectorAll('textarea[name^="answer:"], input[type="text"][name^="answer:"]')) {
      expect(field.getAttribute('maxlength')).toBe('2000');
    }
    for (const field of dom.window.document.querySelectorAll('#issues [data-k="where"], #issues [data-k="what"], #issues [data-k="expected"], #issues [data-k="repro"]')) {
      expect(field.getAttribute('maxlength')).toBe('3000');
    }

    dom.window.document.querySelector<HTMLButtonElement>('#addIssue')?.click();
    expect(dom.window.document.querySelectorAll('#issues .issue')).toHaveLength(2);
    for (const field of dom.window.document.querySelectorAll('#issues .issue:last-child [data-k="where"], #issues .issue:last-child [data-k="what"], #issues .issue:last-child [data-k="expected"], #issues .issue:last-child [data-k="repro"]')) {
      expect(field.getAttribute('maxlength')).toBe('3000');
    }
  } finally {
    dom.window.close();
  }
});
