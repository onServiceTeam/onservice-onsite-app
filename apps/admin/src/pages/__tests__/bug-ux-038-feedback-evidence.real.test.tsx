import { beforeEach, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { mockFeedbackApi, renderFeedbackPage } from './feedback-test-fixtures';

beforeEach(mockFeedbackApi);

it('Bug UX-038 — feedback detail preserves reproduction steps, expected behavior, ratings, answers, and screenshots', async () => {
  renderFeedbackPage();

  expect(await screen.findByText('Choose QR and complete payment.')).toBeTruthy();
  expect(screen.getByText('Return to the wallet with a clear status.')).toBeTruthy();
  expect(screen.getByText('I could not find help.')).toBeTruthy();
  expect(screen.getByText('2')).toBeTruthy();
  const screenshot = screen.getByRole('img', { name: 'Tester evidence 1' });
  expect(screenshot.getAttribute('src')).toBe('/uploads/feedback/evidence.png');
});
