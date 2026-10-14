// HA-M2-190 (D38 Milestone 2, package P5b): the quote card compares the price
// with the customer's budget exactly as the server decided: "Within your
// budget", "₱X above your budget", or nothing when the customer gave no
// budget. The app does no arithmetic of its own here.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QuoteCard } from '@/components/booking/QuoteCard';
import { quoteFixture } from '../test-support/request-fixtures';

it('HA-M2-190: the budget line reads within, above by the server amount, or nothing without a budget', () => {
  const within = render(<QuoteCard quote={quoteFixture({ budget: { kind: 'within', aboveBy: 0 } })} />);
  expect(screen.getByText('Within your budget')).toBeTruthy();
  within.unmount();

  const above = render(<QuoteCard quote={quoteFixture({ quotedPrice: 300000, budget: { kind: 'above', aboveBy: 50000 } })} />);
  expect(screen.getByText('₱500.00 above your budget')).toBeTruthy();
  expect(screen.queryByText('Within your budget')).toBeNull();
  above.unmount();

  const { container } = render(<QuoteCard quote={quoteFixture({ budget: { kind: 'no_budget', aboveBy: null } })} />);
  expect(container.textContent).not.toMatch(/your budget/);
});
