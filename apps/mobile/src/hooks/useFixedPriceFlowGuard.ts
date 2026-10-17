/**
 * D41 Q39 (Ken, 2026-10-18): while request-first booking is on, the old
 * fixed-price screens (configure, form, checkout) are not used, and the
 * server refuses new fixed-price bookings. A customer who still reaches one
 * (an old link or a reloaded web page) is sent to the request form.
 *
 * The screens stay in the app for the day admin switches request-first off.
 * The redirect waits until the config has answered, so a customer is not
 * bounced away while it loads after the switch has been turned off.
 *
 * Returns:
 * - 'checking' while the config has not answered yet. The screen shows a
 *   neutral loading state, not the old screen, so nobody can tap Pay on a
 *   booking the server would then refuse.
 * - 'leaving' once request-first is on: the screen shows nothing while the
 *   request form opens.
 * - 'stay' once request-first is off: the old screen works as before.
 */
import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { Routes } from '@/config/navigation';
import { useRequestFirstBookingState } from '@/hooks/useRequestFirstBooking';

export type FixedPriceFlow = 'checking' | 'leaving' | 'stay';

export function useFixedPriceFlowGuard(): FixedPriceFlow {
  const router = useRouter();
  const { requestFirst, settled } = useRequestFirstBookingState();
  const leave = settled && requestFirst;
  const redirected = useRef(false);

  useEffect(() => {
    if (!leave || redirected.current) return;
    redirected.current = true;
    router.replace(Routes.CUSTOMER.BOOKING_JOB_REQUEST);
  }, [leave, router]);

  if (!settled) return 'checking';
  return leave ? 'leaving' : 'stay';
}

export default useFixedPriceFlowGuard;
