import { getBirCalendar } from '../src/services/compliance.service';

it('Bug OPS-206 — BIR calendar rejects an unapproved filing schedule instead of publishing false deadlines', () => {
  expect(() => getBirCalendar(2026)).toThrow(expect.objectContaining({
    statusCode: 503,
    message: expect.stringMatching(/accountant-approved taxpayer profile.*E22/i),
  }));

  expect(() => getBirCalendar(1999)).toThrow(expect.objectContaining({
    statusCode: 400,
  }));
});
