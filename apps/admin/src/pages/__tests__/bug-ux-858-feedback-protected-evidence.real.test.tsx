import { beforeEach, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { mockFeedbackApi, renderFeedbackPage } from './feedback-test-fixtures';

beforeEach(mockFeedbackApi);

it('Bug UX-858 — Admin tester evidence renders only through the authenticated feedback proxy', async () => {
  renderFeedbackPage();

  const screenshot = await screen.findByRole('img', { name: 'Tester evidence 1' });
  const expected = '/api/v1/admin/feedback/feedback-1/screenshots/evidence.png';
  expect(screenshot).toHaveAttribute('src', expected);
  expect(screenshot.closest('a')).toHaveAttribute('href', expected);
  expect(screenshot.getAttribute('src')).not.toMatch(/^\/uploads\/feedback\//);
});
