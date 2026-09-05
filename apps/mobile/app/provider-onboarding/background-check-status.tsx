import React from 'react';
import { ProviderApplicationStatusScreen } from '@/components/ProviderApplicationStatusScreen';

// Both historical status URLs render the same canonical review and access flow.
export default function BackgroundCheckStatusScreen(): React.ReactElement {
  return <ProviderApplicationStatusScreen routeName="background-check-status" />;
}
