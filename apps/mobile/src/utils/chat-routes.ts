/**
 * D38 Milestone 2: chat routes. A booking can have one thread per pro, so
 * the customer's chat route names the pro (?provider=<providerUserId>). The
 * provider's route needs only the booking (each pro has one thread on it).
 */
import { buildRoute, Routes } from '@/config/navigation';

export function customerChatRoute(bookingId: string, providerUserId?: string | null): string {
  const route = buildRoute(Routes.CUSTOMER.CHAT, { id: bookingId });
  return providerUserId ? `${route}?provider=${encodeURIComponent(providerUserId)}` : route;
}

export function providerChatRoute(bookingId: string): string {
  return buildRoute(Routes.PROVIDER.CHAT, { id: bookingId });
}
