import { beforeEach, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { mockFeedbackApi, renderFeedbackPage } from './feedback-test-fixtures';

beforeEach(mockFeedbackApi);

it('Bug UX-869 — tester-feedback search exposes the same 100-character boundary enforced by the API', async () => {
  renderFeedbackPage();

  const input = await screen.findByRole('textbox', { name: 'Search tester feedback' });
  expect(input).toHaveAttribute('maxlength', '100');
});
