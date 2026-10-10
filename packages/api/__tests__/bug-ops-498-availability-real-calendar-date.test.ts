import { availabilityOverrideSchema } from '../src/validators/provider.validators';

it('Bug OPS-498 — date overrides reject impossible calendar dates before reaching PostgreSQL', () => {
  for (const overrideDate of ['2099-02-29', '2100-02-29', '2099-04-31', '2099-13-01', '2099-00-01', '2099-01-00']) {
    const result = availabilityOverrideSchema.safeParse({ overrideDate, isAvailable: false });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ['overrideDate'], message: 'Enter a real calendar date' }),
    ]));
  }
  for (const overrideDate of ['2099-02-28', '2104-02-29', '2400-02-29', '2099-12-31']) {
    expect(availabilityOverrideSchema.safeParse({ overrideDate, isAvailable: false }).success).toBe(true);
  }
});
