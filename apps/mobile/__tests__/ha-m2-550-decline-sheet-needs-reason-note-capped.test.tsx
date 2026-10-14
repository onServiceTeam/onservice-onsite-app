// HA-M2-550 (D38 Milestone 2, package P5b): the decline sheet will not send
// without a reason (the server requires one), offers the four reasons, caps
// the optional note at 300 characters (the server limit) and tells the
// customer the pro sees the reason but not the note.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DeclineReasonSheet } from '@/components/booking/DeclineReasonSheet';

it('HA-M2-550: Decline quote stays disabled until a reason is chosen, the note is capped at 300, and only the reason is sent', () => {
  const onSubmit = jest.fn();
  render(<DeclineReasonSheet visible providerName="Cebu Cooling" onSubmit={onSubmit} onCancel={jest.fn()} />);

  expect(screen.getAllByRole('radio').map((node) => node.getAttribute('aria-label')))
    .toEqual(['Price too high', 'Timing does not work', 'Changed my mind', 'Other']);
  expect(screen.getByText(/Cebu Cooling is told the reason you pick\. Your note stays with onService and is not shown to pros\./)).toBeTruthy();
  const decline = screen.getByRole('button', { name: 'Decline quote' }) as HTMLButtonElement;
  expect(decline.disabled).toBe(true);
  fireEvent.click(decline);
  expect(onSubmit).not.toHaveBeenCalled();

  const note = screen.getByLabelText('Note for onService');
  expect(note.getAttribute('maxlength')).toBe('300');
  fireEvent.change(note, { target: { value: '   ' } });
  fireEvent.click(screen.getByRole('radio', { name: 'Changed my mind' }));
  expect(decline.disabled).toBe(false);
  fireEvent.click(decline);
  // A blank note is not sent.
  expect(onSubmit).toHaveBeenCalledWith({ reason: 'changed_mind' });
});
