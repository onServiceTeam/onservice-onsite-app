import { expect, it } from 'vitest';
import { todayLocalIso } from '../ConsentVersionsPage';

it('Bug PHASE111-01 — the consent effective-date default follows the Manila calendar day', () => {
  expect(todayLocalIso(new Date('2026-05-06T16:30:00.000Z'))).toBe('2026-05-07');
});
