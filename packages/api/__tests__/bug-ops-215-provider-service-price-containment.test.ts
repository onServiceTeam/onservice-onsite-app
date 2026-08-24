import { formatProviderService } from '../src/services/provider.service';
import { addServiceSchema } from '../src/validators/provider.validators';

describe('OPS-215 — E16 provider price containment', () => {
  it('returns the fixed catalog price instead of a conflicting stored provider price', () => {
    const formatted = formatProviderService({
      id: 'provider-service-1',
      provider_id: 'provider-1',
      subcategory_id: 'subcategory-1',
      category_id: 'category-1',
      base_price: '90000',
      catalog_base_price: 50000,
      subcategory_name: 'General Cleaning',
      pricing_type: 'fixed',
      is_active: true,
      created_at: new Date('2026-08-24T00:00:00.000Z'),
    });

    expect(formatted).toMatchObject({
      subcategoryName: 'General Cleaning',
      pricingType: 'fixed',
      basePrice: 50000,
    });
    expect(formatted.basePrice).not.toBe(90000);

    const parsed = addServiceSchema.parse({
      subcategoryId: '11111111-1111-4111-8111-111111111111',
      basePrice: 90000,
    });
    expect(parsed).toEqual({ subcategoryId: '11111111-1111-4111-8111-111111111111' });
  });
});
