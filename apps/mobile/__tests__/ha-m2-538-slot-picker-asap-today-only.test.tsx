// HA-M2-538 (D38 Milestone 2, package P5b): the slot picker offers "As soon
// as possible" for today only, does not offer a window that has already
// ended today, and clears a window that does not exist on a newly chosen
// date (the server refuses ASAP on any other day).
import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QuoteSlotPicker } from '@/components/provider/QuoteSlotPicker';
import type { QuoteTimeWindow } from '@/services/request.service';

// Wednesday 14 Oct 2026, 1:30 PM in Manila: the morning window is over.
const AFTERNOON = Date.parse('2026-10-14T05:30:00.000Z');

function Harness({ onChange }: { onChange: (value: { date: string | null; window: QuoteTimeWindow | null }) => void }): React.ReactElement {
  const [value, setValue] = useState<{ date: string | null; window: QuoteTimeWindow | null }>({ date: null, window: null });
  return (
    <QuoteSlotPicker
      value={value}
      nowMs={AFTERNOON}
      onChange={(next) => { setValue(next); onChange(next); }}
    />
  );
}

it('HA-M2-538: As soon as possible shows only for today, ended windows are hidden, and changing day clears ASAP', () => {
  const onChange = jest.fn();
  render(<Harness onChange={onChange} />);

  fireEvent.click(screen.getByRole('radio', { name: 'Today, Wed 14 Oct' }));
  const todayWindows = screen.getAllByRole('radio').map((node) => node.getAttribute('aria-label')).filter((label) => !/\d{1,2} [A-Z][a-z]{2}$/.test(label ?? ''));
  expect(todayWindows).toEqual([
    'Afternoon (12 PM to 5 PM)',
    'Evening (5 PM to 9 PM)',
    'As soon as possible (today only)',
  ]);
  fireEvent.click(screen.getByRole('radio', { name: 'As soon as possible (today only)' }));
  expect(onChange).toHaveBeenLastCalledWith({ date: '2026-10-14', window: 'asap' });

  fireEvent.click(screen.getByRole('radio', { name: 'Tomorrow, Thu 15 Oct' }));
  expect(onChange).toHaveBeenLastCalledWith({ date: '2026-10-15', window: null });
  const tomorrowWindows = screen.getAllByRole('radio').map((node) => node.getAttribute('aria-label')).filter((label) => !/\d{1,2} [A-Z][a-z]{2}$/.test(label ?? ''));
  expect(tomorrowWindows).toEqual([
    'Morning (8 AM to 12 PM)',
    'Afternoon (12 PM to 5 PM)',
    'Evening (5 PM to 9 PM)',
  ]);
});
