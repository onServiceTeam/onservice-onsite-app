import { beforeEach, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { mockFeedbackApi, renderFeedbackPage } from './feedback-test-fixtures';

beforeEach(mockFeedbackApi);

it('Bug UX-417 — feedback review shows earlier owners, decisions, and evidence notes', async () => {
  renderFeedbackPage();

  expect(await screen.findByRole('heading', { name: 'Ownership and decisions' })).toBeTruthy();
  expect(screen.getByText('New → Triaged')).toBeTruthy();
  expect(screen.getByText(/owner Unassigned → Ana Reyes/)).toBeTruthy();
  expect(screen.getByText('Verified the payment return problem and assigned the checkout fix.')).toBeTruthy();
});
