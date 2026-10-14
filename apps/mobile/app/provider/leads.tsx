// D27 Phase 1 introduced this "Job Requests" screen. D38 Milestone 2 (package
// P5b) moved the inbox to the provider Requests tab
// (app/(provider-tabs)/requests.tsx). This route stays so old links keep
// working: the desktop web menu (WebAppFrame, Routes.PROVIDER.LEADS), push
// notifications sent by older servers, and bookmarks. It shows the same
// Requests screen, with a back button because it opens on top of the tabs.
import React from 'react';
import { RequestsScreen } from '../(provider-tabs)/requests';

export default function ProviderLeadsScreen(): React.ReactElement {
  return <RequestsScreen showBack />;
}
