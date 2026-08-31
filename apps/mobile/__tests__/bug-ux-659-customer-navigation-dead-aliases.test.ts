import { Routes } from '@/config/navigation';

it('Bug UX-659 — customer navigation exposes the real tab routes instead of dead customer home and history aliases', () => {
  expect(Routes.TABS.HOME).toBe('/(tabs)/home');
  expect(Routes.TABS.BOOKINGS).toBe('/(tabs)/bookings');
  expect('HOME' in Routes.CUSTOMER).toBe(false);
  expect('BOOKING_HISTORY' in Routes.CUSTOMER).toBe(false);
});
