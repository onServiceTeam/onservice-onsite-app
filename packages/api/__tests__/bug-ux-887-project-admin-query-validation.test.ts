import { adminProjectListQuerySchema } from '../src/routes/project-admin.routes';

it('Bug UX-887 — Admin project discovery rejects short, oversized, unknown, and out-of-range query controls before service work', () => {
  expect(adminProjectListQuerySchema.safeParse({ search: 'x' }).success).toBe(false);
  expect(adminProjectListQuerySchema.safeParse({ search: 'x'.repeat(101) }).success).toBe(false);
  expect(adminProjectListQuerySchema.safeParse({ status: 'paid' }).success).toBe(false);
  expect(adminProjectListQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  expect(adminProjectListQuerySchema.safeParse({ pageSize: '101' }).success).toBe(false);
  expect(adminProjectListQuerySchema.safeParse({ unsupported: 'field' }).success).toBe(false);
  expect(adminProjectListQuerySchema.parse({ search: ' Ramos ', status: 'active', page: '2', pageSize: '20' })).toEqual({
    search: 'Ramos', status: 'active', page: 2, pageSize: 20,
  });
});
