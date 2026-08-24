import { notificationListQuerySchema } from '../src/validators/notification.validators';

it('Bug UX-142 — notification pagination coerces valid query strings and rejects negative, zero, fractional, or oversized limits', () => {
  expect(notificationListQuerySchema.parse({ page: '2', pageSize: '50' })).toEqual({ page: 2, pageSize: 50 });
  expect(notificationListQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  expect(notificationListQuerySchema.safeParse({ page: '-1' }).success).toBe(false);
  expect(notificationListQuerySchema.safeParse({ pageSize: '51' }).success).toBe(false);
  expect(notificationListQuerySchema.safeParse({ pageSize: '2.5' }).success).toBe(false);
});
