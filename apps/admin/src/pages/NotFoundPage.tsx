// Phase L MED-L01 fix — admin 404 page.
//
// Pre-fix: App.tsx had no `<Route path="*">` catch-all. A typo in the
// URL (e.g., `/customer` instead of `/customers`, or `/booking`
// instead of `/bookings`) rendered a blank screen with no error
// indication. Admins debugging a stale link had no way to know the
// URL was wrong.
//
// Post-fix: this page mounts on any unmatched route and shows a
// clear "Page not found" + a "Back to dashboard" link. Mounted inside
// `<Route element={<AdminLayout />}>` so the admin chrome (sidebar,
// header) stays visible — the user doesn't lose context.

import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function NotFoundPage(): React.ReactElement {
  const location = useLocation();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8 text-center">
      <h1 className="text-4xl font-bold text-[var(--color-text)]">404</h1>
      <p className="text-xl font-semibold text-[var(--color-text)]">Page not found</p>
      <p className="text-[var(--color-text-secondary)]">
        We couldn&apos;t find <code className="px-1 py-0.5 bg-[var(--color-bg)] rounded text-sm">{location.pathname}</code>.
        It may have moved, or the link might be out of date.
      </p>
      <Link
        to="/"
        className="mt-4 inline-flex items-center px-4 py-2 rounded-md bg-[var(--color-primary)] text-white hover:opacity-90 transition"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
