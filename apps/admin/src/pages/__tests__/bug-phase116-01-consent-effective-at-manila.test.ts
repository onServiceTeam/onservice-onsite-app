import { expect, it } from 'vitest';
import { manilaDateToIso } from '../ConsentVersionsPage';

it('Bug PHASE116-01 — a selected consent effective day is persisted from Manila midnight', () => {
  expect(manilaDateToIso('2026-05-05')).toBe('2026-05-04T16:00:00.000Z');
});
