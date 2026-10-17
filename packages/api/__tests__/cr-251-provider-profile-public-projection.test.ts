// CR-251 (customer review 2026-10-17, slice P2, discovery-support-4):
// Service Provider profile privacy fix. The profile a customer opens carries
// the public projection only: the business name first, the person's name in
// the same form the screen showed before (first and last name), and the
// photo. It carries no map location, no account status and no other private
// field (no account id, no "available now" flag). Real provider router, real
// authentication middleware, real SQL on the guarded PostgreSQL fixture.
import {
  approvedAvatarUrl, approvedProvider, customerUser, p2Http, p2It as it, withP2Database,
} from './helpers/p2-switches-postgres';
import providerRouter from '../src/routes/provider.routes';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug CR-251 — an approved Service Provider profile returns the business name, the person\'s name and the photo, and no location, status or account fields', async () => {
  await withP2Database(async () => {
    const http = p2Http([['/api/v1/providers', providerRouter]]);
    const response = await http.get(`/api/v1/providers/${approvedProvider}`, { userId: customerUser, role: 'customer' });

    expect(response.status).toBe(200);
    const data = response.body.data as Record<string, unknown>;
    // Exactly the public keys, nothing else.
    expect(Object.keys(data).sort()).toEqual([
      'acceptanceRate', 'avatarUrl', 'bio', 'businessName', 'certifications', 'city', 'id', 'name',
      'portfolio', 'province', 'rating', 'ratings', 'responseTimeMinutes', 'schedule', 'serviceRadiusKm',
      'services', 'sukiCount', 'tier', 'totalJobs', 'yearsExperience',
    ]);
    expect(data).toMatchObject({
      id: approvedProvider,
      businessName: 'Linis Pro Cleaning Services',
      name: 'Ana Reyes',
      avatarUrl: approvedAvatarUrl,
      tier: 'verified',
      rating: 4.8,
      totalJobs: 42,
      city: 'Cebu City',
      province: 'Cebu',
    });
    for (const privateKey of ['latitude', 'longitude', 'status', 'userId', 'isAvailable', 'createdAt']) {
      expect({ privateKey, present: privateKey in data }).toEqual({ privateKey, present: false });
    }
    // The raw coordinates appear nowhere in the answer.
    expect(JSON.stringify(response.body)).not.toMatch(/10\.3157|123\.8854/);
    // The services and the weekly schedule still come through for booking.
    expect(data.services).toEqual([expect.objectContaining({ subcategoryName: 'Home deep cleaning' })]);
    expect(data.schedule).toEqual([expect.objectContaining({ dayOfWeek: 1, startTime: '08:00', endTime: '17:00' })]);
  });
}, 90000);
