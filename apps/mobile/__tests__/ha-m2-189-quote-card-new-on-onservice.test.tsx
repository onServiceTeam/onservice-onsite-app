// HA-M2-189 (D38 Milestone 2, package P5b): a pro with fewer than 3 visible
// reviews (the server's isNew) shows "New on onService" instead of a rating
// that would look weak or misleading; others show their rating and count.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QuoteCard } from '@/components/booking/QuoteCard';
import { quoteFixture } from '../test-support/request-fixtures';

it('HA-M2-189: a pro with under 3 reviews shows "New on onService" and no star rating; an established pro shows the rating', () => {
  const fresh = render(
    <QuoteCard quote={quoteFixture({ provider: { ...quoteFixture().provider, ratingAverage: 5, ratingCount: 2, isNew: true, jobsCompleted: 1 } })} />,
  );
  expect(screen.getByText('New on onService')).toBeTruthy();
  expect(screen.queryByText(/reviews\)/)).toBeNull();
  expect(screen.getByText('1 job completed')).toBeTruthy();
  fresh.unmount();

  render(<QuoteCard quote={quoteFixture()} />);
  expect(screen.queryByText('New on onService')).toBeNull();
  expect(screen.getByText('4.8 (12 reviews)')).toBeTruthy();
  expect(screen.getByText('42 jobs completed')).toBeTruthy();
});
