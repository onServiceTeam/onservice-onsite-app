// HA-M2-570 (D38 Milestone 2, local visual check 2026-10-14): the quote card
// never tells the customer a service fee will be added. The customer service
// fee is 0 today (Ken, 2026-06-28) and the confirm screen shows the server's
// exact total, so the card points there instead of promising a fee.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QuoteCard } from '@/components/booking/QuoteCard';
import { quoteFixture, NOW } from '../test-support/request-fixtures';

it('HA-M2-570: the quote card says the exact total is on the next screen and never promises a service fee', () => {
  const { container } = render(<QuoteCard quote={quoteFixture()} nowMs={NOW} onAccept={jest.fn()} />);

  expect(screen.getByText('You see the exact total on the next screen before you confirm.')).toBeTruthy();
  expect(container.textContent).not.toMatch(/service fee/i);
});
