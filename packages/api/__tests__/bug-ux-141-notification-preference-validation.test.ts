import { notificationPreferencesSchema } from '../src/validators/notification.validators';

it('Bug UX-141 — notification preference writes reject wrong types and undeclared fields before reaching Postgres', () => {
  expect(notificationPreferencesSchema.safeParse({ messages: false, quietHoursStart: '22:30' }).success).toBe(true);
  expect(notificationPreferencesSchema.safeParse({ messages: 'false' }).success).toBe(false);
  expect(notificationPreferencesSchema.safeParse({ quietHoursStart: '25:00' }).success).toBe(false);
  expect(notificationPreferencesSchema.safeParse({ marketingConsentAcknowledgedAt: new Date().toISOString() }).success).toBe(false);
});
