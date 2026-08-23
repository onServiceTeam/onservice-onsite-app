import { isRouteOwnedByRole } from '@/components/WebAppFrame';

it('Bug UX-109 — the desktop shell suppresses persona navigation on routes owned by another role', () => {
  expect(isRouteOwnedByRole('/provider/certifications', 'customer')).toBe(false);
  expect(isRouteOwnedByRole('/customer/projects', 'provider')).toBe(false);
  expect(isRouteOwnedByRole('/staff/jobs', 'provider')).toBe(false);
  expect(isRouteOwnedByRole('/provider/certifications', 'provider')).toBe(true);
  expect(isRouteOwnedByRole('/customer/projects', 'customer')).toBe(true);
  expect(isRouteOwnedByRole('/staff/jobs', 'provider_staff')).toBe(true);
  expect(isRouteOwnedByRole('/support', 'customer')).toBe(true);
  expect(isRouteOwnedByRole('/support', 'provider')).toBe(true);
});
