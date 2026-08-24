import { resolveNotificationRoute } from '../src/utils/notification-navigation';

it('Bug UX-137 — provider operational notices resolve to the workspace where the provider can act on them', () => {
  expect(resolveNotificationRoute('payout', { payoutId: 'payout-1' }, 'provider')).toBe('/provider/payouts');
  expect(resolveNotificationRoute('new_job_request', { bookingId: 'request-1' }, 'provider')).toBe('/provider/leads');
  expect(resolveNotificationRoute('provider_reminder', { reminderId: 'reminder-1' }, 'provider')).toBe('/provider/reminders');
  expect(resolveNotificationRoute('provider_certification_unverified', { certificationId: 'cert-1' }, 'provider')).toBe('/provider/certifications');
  expect(resolveNotificationRoute('provider_staff_rejected', { staffId: 'staff-1' }, 'provider')).toBe('/provider/team');
  expect(resolveNotificationRoute('provider_suspended', { providerId: 'provider-1' }, 'provider')).toBe('/provider/account-management');
});
