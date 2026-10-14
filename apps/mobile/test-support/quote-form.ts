/**
 * D38 Milestone 2 test support (package P5b): fill the provider quote form
 * (app/provider/job/[id]/quote.tsx) the way a provider would. Tests that use
 * the slot picker spy Date.now to return request-fixtures NOW (Wednesday
 * 14 Oct 2026, 09:00 Manila), so "Tomorrow" is Thu 15 Oct.
 */
import { fireEvent, screen } from '@testing-library/react';

export const INCLUDED_TEXT = 'Clean and check one split-type aircon, including the drain line.';

export function enterPrice(pesos: string): void {
  fireEvent.change(screen.getByLabelText('Total price in pesos'), { target: { value: pesos } });
}

export function enterIncluded(text: string = INCLUDED_TEXT): void {
  fireEvent.change(screen.getByLabelText('What is included'), { target: { value: text } });
}

export function chooseTomorrowMorning(): void {
  fireEvent.click(screen.getByRole('radio', { name: 'Tomorrow, Thu 15 Oct' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Morning (8 AM to 12 PM)' }));
}

export function sendButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Send quote' }) as HTMLButtonElement;
}
