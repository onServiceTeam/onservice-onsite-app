import { platformConfig } from '../src/config/platform.config';

describe('provider commission tier defaults', () => {
  it('Bug MED-K20 — runtime configuration exposes every supported tier including founding', () => {
    expect(platformConfig.commissionRates).toEqual({
      founding: 0.10,
      new: 0.15,
      verified: 0.13,
      pro: 0.11,
      elite: 0.09,
    });
  });
});
