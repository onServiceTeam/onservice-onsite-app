import { staffListQuerySchema } from '../src/validators/staff.validators';

it('Bug UX-543 — staff list filters are strictly parsed and reject unknown or malformed access filters', () => {
  expect(staffListQuerySchema.parse({
    page: '2',
    profileActive: 'false',
    accountActive: 'true',
    accountRole: 'super_admin',
    search: 'Ana Reyes',
  })).toMatchObject({
    page: 2,
    profileActive: false,
    accountActive: true,
    accountRole: 'super_admin',
    search: 'Ana Reyes',
  });
  expect(staffListQuerySchema.safeParse({ accountRole: 'customer' }).success).toBe(false);
  expect(staffListQuerySchema.parse({ profileMissing: 'true' }).profileMissing).toBe(true);
  expect(staffListQuerySchema.safeParse({ profileMissing: 'true', profileActive: 'false' }).success).toBe(false);
  expect(staffListQuerySchema.safeParse({ unexpected: 'true' }).success).toBe(false);
});
