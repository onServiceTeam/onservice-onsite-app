import { beforeEach, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { mockFeedbackApi, renderFeedbackPage } from './feedback-test-fixtures';

beforeEach(mockFeedbackApi);

it('Bug UX-870 — feedback status cards explain that counts follow search and app-area scope', async () => {
  renderFeedbackPage();

  const explanation = await screen.findByText(/status counts follow the active app-area and search filters/i);
  const section = screen.getByRole('region', { name: 'Tester feedback status counts' });
  expect(explanation).toHaveAttribute('id', 'feedback-count-scope');
  expect(section).toHaveAttribute('aria-describedby', 'feedback-count-scope');
  expect(await screen.findByRole('button', { name: /^New 10$/i })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: /^Triaged 0$/i })).toHaveAttribute('aria-pressed', 'false');
});
