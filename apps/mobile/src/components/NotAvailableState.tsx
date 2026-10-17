import React from 'react';
import { useRouter } from 'expo-router';
import { EmptyState } from '@/components/ui';
import { Routes } from '@/config/navigation';

/**
 * D41 point 7: one short line and one button. Shown on a screen whose program
 * is switched off (Referral, Suki). "Go back" returns to the previous screen,
 * or to Home when there is none (for example a reloaded web page).
 */
export default function NotAvailableState(): React.ReactElement {
  const router = useRouter();
  const goBack = (): void => {
    if (typeof router.canGoBack === 'function' && router.canGoBack()) router.back();
    else router.replace(Routes.TABS.HOME);
  };
  return <EmptyState title="Not available right now" actionLabel="Go back" onAction={goBack} />;
}
