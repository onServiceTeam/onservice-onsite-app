const queryMock = jest.fn();
const getLatestFinalTermsMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));
jest.mock('../src/services/booking-financial-terms.service', () => ({
  getLatestFinalTerms: (...args: unknown[]) => getLatestFinalTermsMock(...args),
}));

import { generateReceipt } from '../src/services/provider-tools.service';

it('Bug OPS-254 — provider receipt reproduces the booking snapshot instead of the current tier rate', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{
      id: 'provider-1', user_id: 'provider-user-1', business_name: 'Cebu Care', tier: 'elite',
      first_name: 'Ana', last_name: 'Santos', phone: '+639171234567',
    }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{
      id: 'booking-1', description: 'Deep cleaning', scheduled_at: new Date('2026-08-20T01:00:00.000Z'),
      completed_at: new Date('2026-08-20T04:00:00.000Z'), service_price: 100000,
      total_amount: 110000, service_fee: 10000, status: 'confirmed', customer_name: 'Customer',
      customer_phone: '+639181234567', address: '1 Main St', barangay: 'Lahug', city: 'Cebu City',
      province: 'Cebu', category_name: 'Cleaning', subcategory_name: 'Deep Cleaning',
    }], rowCount: 1 });
  getLatestFinalTermsMock.mockResolvedValueOnce({
    providerId: 'provider-1', servicePriceCentavos: 100000, serviceFeeAmountCentavos: 10000,
    commissionRateBasisPoints: 1200, commissionAmountCentavos: 12000,
    providerReceivesCentavos: 88000,
  });

  const receipt = await generateReceipt('provider-1', 'booking-1');

  expect(receipt.financial).toEqual({
    servicePrice: 100000,
    serviceFee: 10000,
    commissionRate: 0.12,
    commissionAmount: 12000,
    netEarnings: 88000,
  });
  expect(getLatestFinalTermsMock).toHaveBeenCalledWith('booking-1');
});
