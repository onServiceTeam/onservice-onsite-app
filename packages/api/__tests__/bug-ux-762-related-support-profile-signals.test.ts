const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
  },
}));

jest.mock('../src/services/settings.service', () => ({
  getSettingInteger: jest.fn().mockResolvedValue(5),
  getSetting: jest.fn().mockResolvedValue('0.80'),
  getMaxProviderServiceRadiusKm: jest.fn().mockResolvedValue(50),
}));

import { getCustomerProfile } from '../src/services/customer-admin.service';
import { getProviderProfile } from '../src/services/provider-admin.service';

function result(rows: unknown[]) {
  return Promise.resolve({ rows, rowCount: rows.length });
}

describe('Bug UX-762 — related support signals in account profiles', () => {
  it('Bug UX-762 — counts booking-linked and staff-linked cases in the customer and provider 360 headers', async () => {
    dbQueryMock.mockImplementation((sqlValue: unknown) => {
      const sql = String(sqlValue);
      if (sql.includes("WHERE u.id = $1 AND u.role = 'customer'")) {
        const includesLinkedCustomerCases = sql.includes('support_booking.customer_id = u.id');
        return result([{
          id: '10000000-0000-4000-8000-000000000762',
          first_name: 'Customer',
          last_name: 'Example',
          phone: '+639171234567',
          email: 'customer@example.com',
          avatar_url: null,
          is_verified: true,
          is_active: true,
          is_flagged_fraud: false,
          active_refresh_sessions: '2',
          open_support_cases: includesLinkedCustomerCases ? '4' : '0',
          urgent_support_cases: includesLinkedCustomerCases ? '2' : '0',
          unassigned_support_cases: includesLinkedCustomerCases ? '1' : '0',
          support_owner_names: includesLinkedCustomerCases ? ['Support Owner'] : [],
          last_login_at: null,
          created_at: new Date('2026-08-31T00:00:00.000Z'),
        }]);
      }
      if (sql.includes('FROM providers p') && sql.includes('JOIN users u ON u.id = p.user_id')) {
        const includesLinkedProviderCases =
          sql.includes('support_booking.provider_id = p.id') &&
          sql.includes('support_staff.provider_id = p.id');
        return result([{
          id: '20000000-0000-4000-8000-000000000762',
          user_id: '30000000-0000-4000-8000-000000000762',
          business_name: 'Provider Example',
          description: 'Example provider',
          tier: 'standard',
          status: 'approved',
          service_radius_km: 10,
          years_experience: 5,
          vetting_answers: null,
          rating: '4.8',
          total_reviews: 12,
          total_jobs: 24,
          latitude: null,
          longitude: null,
          city: 'Cebu City',
          province: 'Cebu',
          created_at: new Date('2026-08-31T00:00:00.000Z'),
          updated_at: new Date('2026-08-31T00:00:00.000Z'),
          u_id: '30000000-0000-4000-8000-000000000762',
          first_name: 'Provider',
          last_name: 'Owner',
          phone: '+639179876543',
          email: 'provider@example.com',
          avatar_url: null,
          is_verified: true,
          is_active: true,
          active_refresh_sessions: '3',
          open_support_cases: includesLinkedProviderCases ? '6' : '0',
          urgent_support_cases: includesLinkedProviderCases ? '2' : '0',
          unassigned_support_cases: includesLinkedProviderCases ? '1' : '0',
          support_owner_names: includesLinkedProviderCases ? ['Provider Support'] : [],
          pending_service_area_changes: '3',
          last_login_at: null,
        }]);
      }
      return result([]);
    });

    const customer = await getCustomerProfile(
      '10000000-0000-4000-8000-000000000762',
      'admin',
    );
    const provider = await getProviderProfile(
      '20000000-0000-4000-8000-000000000762',
      'admin',
    );

    expect(customer).toMatchObject({
      openSupportCases: 4,
      urgentSupportCases: 2,
      unassignedSupportCases: 1,
      supportOwnerNames: ['Support Owner'],
    });
    expect(provider).toMatchObject({
      openSupportCases: 6,
      urgentSupportCases: 2,
      unassignedSupportCases: 1,
      supportOwnerNames: ['Provider Support'],
      pendingServiceAreaChanges: 3,
    });
  });
});
