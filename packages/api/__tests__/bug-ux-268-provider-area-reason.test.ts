import { providerServiceAreaChangeSchema } from '../src/validators/provider.validators';

it('Bug UX-268 — a provider area-change request requires useful review context', () => {
  const base = {
    areaId: '11111111-1111-4111-8111-111111111111',
    radiusKm: 15,
    latitude: 10.3157,
    longitude: 123.8854,
  };

  expect(providerServiceAreaChangeSchema.safeParse(base).success).toBe(false);
  expect(providerServiceAreaChangeSchema.safeParse({ ...base, reason: 'Moved shop' }).success).toBe(true);
});
