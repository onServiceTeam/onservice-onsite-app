import { resolveNotificationRoute } from '../src/utils/notification-navigation';

it('Bug UX-642 — service-area decisions open the provider service-area workspace instead of becoming dead notifications', () => {
  expect(resolveNotificationRoute('service_area_change_approved', { requestId: 'area-request-1' }, 'provider')).toBe('/provider/service-area');
  expect(resolveNotificationRoute('service_area_change_rejected', { requestId: 'area-request-2' }, 'provider')).toBe('/provider/service-area');
});
