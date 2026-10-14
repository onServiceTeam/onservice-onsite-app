// HA-M2-539 (D38 Milestone 2, package P5b): the earliest date runs from today
// to today + 30 on the Manila calendar (the range the server admits). Late
// in the evening, when no window is left today, the list starts tomorrow.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QuoteSlotPicker } from '@/components/provider/QuoteSlotPicker';

const dateChips = (): string[] => screen.getAllByRole('radio')
  .map((node) => node.getAttribute('aria-label') ?? '')
  .filter((label) => /\d{1,2} [A-Z][a-z]{2}$/.test(label));

it('HA-M2-539: dates run from today to today + 30 in Manila, starting tomorrow once today has no window left', () => {
  // Wednesday 14 Oct 2026, 9:00 AM in Manila.
  const morning = render(<QuoteSlotPicker value={{ date: null, window: null }} onChange={jest.fn()} nowMs={Date.parse('2026-10-14T01:00:00.000Z')} />);
  let chips = dateChips();
  expect(chips).toHaveLength(31);
  expect(chips[0]).toBe('Today, Wed 14 Oct');
  expect(chips[1]).toBe('Tomorrow, Thu 15 Oct');
  expect(chips[30]).toBe('Fri 13 Nov');
  morning.unmount();

  // Wednesday 14 Oct 2026, 9:30 PM in Manila (UTC 13:30): every window has ended.
  render(<QuoteSlotPicker value={{ date: null, window: null }} onChange={jest.fn()} nowMs={Date.parse('2026-10-14T13:30:00.000Z')} />);
  chips = dateChips();
  expect(chips).toHaveLength(30);
  expect(chips[0]).toBe('Tomorrow, Thu 15 Oct');
  expect(chips[29]).toBe('Fri 13 Nov');

  // Thursday 15 Oct in Manila already starts at 16:00 UTC on the 14th.
  render(<QuoteSlotPicker value={{ date: null, window: null }} onChange={jest.fn()} nowMs={Date.parse('2026-10-14T16:30:00.000Z')} />);
  expect(screen.getAllByRole('radio', { name: 'Today, Thu 15 Oct' })).toHaveLength(1);
});
