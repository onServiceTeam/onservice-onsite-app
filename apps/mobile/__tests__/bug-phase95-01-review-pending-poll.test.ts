// BUG-PHASE95-01 — provider-onboarding review-pending screen polls
// for approval and auto-routes to the dashboard.
//
// Pre-fix the screen rendered a static "in progress" timeline and a
// "Go to Home" button. The terms.tsx submit comment referenced this
// screen as the "polls /provider/me for status" landing — but the
// screen never polled. After admin approved the application the
// provider's users.role flipped to 'provider' on the backend, but the
// mobile auth-store stayed on 'customer' until they manually
// re-logged in (or fully restarted the app). The transition felt
// broken for first-time providers.
//
// Fix:
//   - useQuery getMyProfile (returns provider.status) every 15s.
//   - When status flips to 'approved': fetch /api/v1/auth/me, push
//     the refreshed user into the auth store, replace to provider
//     tabs/dashboard.
//   - When status === 'rejected': render an inline rejection notice
//     (different copy, error-colored icon, no timeline).

import { readFileSync } from 'fs';
import { resolve } from 'path';

const REVIEW_PENDING = readFileSync(
  resolve(__dirname, '../app/provider-onboarding/review-pending.tsx'),
  'utf8',
);

describe('BUG-PHASE95-01 — review-pending screen polls and routes on approval', () => {
  it('BUG-PHASE95-01 — useQuery polls getMyProfile at a 15s interval', () => {
    expect(REVIEW_PENDING).toMatch(/useQuery/);
    expect(REVIEW_PENDING).toMatch(/getMyProfile/);
    expect(REVIEW_PENDING).toMatch(/POLL_INTERVAL_MS = 15_000/);
    expect(REVIEW_PENDING).toMatch(/refetchInterval: POLL_INTERVAL_MS/);
  });

  it('BUG-PHASE95-01 — query swallows the 404-pre-approval window so the timeline keeps rendering', () => {
    // First poll can fire before the providers row is committed.
    // The query must catch and return 'pending' rather than blowing
    // up to error state.
    expect(REVIEW_PENDING).toMatch(/return 'pending' as const/);
  });

  it('BUG-PHASE95-01 — approval refreshes the auth store via /api/v1/auth/me', () => {
    expect(REVIEW_PENDING).toMatch(/api\.get<ApiResponse<User>>\('\/api\/v1\/auth\/me'\)/);
    expect(REVIEW_PENDING).toMatch(/setUser\(refreshedUser\)/);
  });

  it('BUG-PHASE95-01 — approval auto-routes to the provider dashboard', () => {
    expect(REVIEW_PENDING).toMatch(
      /router\.replace\(Routes\.PROVIDER_TABS\.DASHBOARD\)/,
    );
  });

  it('BUG-PHASE95-01 — rejected status renders an inline rejection notice', () => {
    expect(REVIEW_PENDING).toMatch(/isRejected = status === 'rejected'/);
    expect(REVIEW_PENDING).toMatch(/Application Not Approved/);
    // The timeline must be hidden for a rejected application — the
    // four-step in-progress UI is misleading after a hard reject.
    expect(REVIEW_PENDING).toMatch(/\{!isRejected && \(/);
  });

  it('BUG-PHASE95-01 — copy matches the new auto-poll behavior, not the old static screen', () => {
    expect(REVIEW_PENDING).toMatch(/auto-refreshes/);
    // The pre-fix "Estimated review time is 24-48 hours" sentence is
    // gone from the info card now that the screen actually reflects
    // live state.
    expect(REVIEW_PENDING).not.toMatch(/Estimated review time is 24-48 hours/);
  });
});
