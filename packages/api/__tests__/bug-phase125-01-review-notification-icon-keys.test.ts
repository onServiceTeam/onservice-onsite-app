// BUG-PHASE125-01 — three layered defects in the review-notification
// pipeline that compounded into "provider has no idea a review was
// left, and even if they did the notification would render with the
// wrong icon and not route anywhere":
//
// Layer 1 — API: review.service.createReview never emitted any
// notification, even though notification.service.ts declared
// `rating_received` in its NotificationType union (L49). Provider
// only saw new reviews if they manually opened the Reviews screen.
//
// Layer 2 — Mobile customer: customer/notifications.tsx icon map
// keyed on `review_received` (a string the API never emits) for the
// Star icon — fell through to the Bell fallback. Same key in the
// routing logic — dead branch. Several other types (chat_started,
// new_message, customer_cancelled, recurring_auto_charge_*,
// new_quote, etc.) also weren't in the icon map at all.
//
// Layer 3 — Mobile provider: provider/notifications.tsx icon map
// keyed on EIGHT types that the API never emits (`new_booking`,
// `booking_assigned`, `booking_confirmed` — wait, that one is
// emitted but to customer not provider; `payment_received`,
// `dispute_opened`, `review_received`, `payout_completed`,
// `tip_received`). EVERY provider notification fell back to Bell.
// The routing logic at L96-101 referenced the same wrong keys —
// every routing branch dead.
//
// Same family as Phase 100 (notification routing) and Phase 106
// (mobile half-built feature). Pattern: "wired one side without
// confirming the other side actually emits the matching key."
//
// Fix: emit `rating_received` from review.service createReview
// (best-effort, outside the trx so a notification failure doesn't
// roll back the review). Replace customer + provider icon-map keys
// to match the actual API enum, expanding both maps to cover the
// types the API really emits. Update routing branches to use the
// correct keys.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const REVIEW = readFileSync(
  resolve(__dirname, '../src/services/review.service.ts'),
  'utf8',
);
const CUSTOMER_NOTIFS = readFileSync(
  resolve(__dirname, '../../../apps/mobile/app/customer/notifications.tsx'),
  'utf8',
);
const PROVIDER_NOTIFS = readFileSync(
  resolve(__dirname, '../../../apps/mobile/app/provider/notifications.tsx'),
  'utf8',
);

describe('BUG-PHASE125-01 — rating notification end-to-end (API emit + mobile icon + mobile route)', () => {
  describe('API review.service createReview emits rating_received', () => {
    it('BUG-PHASE125-01 — notification.service is imported', () => {
      expect(REVIEW).toMatch(/import \* as notificationService from '\.\/notification\.service'/);
    });

    it('BUG-PHASE125-01 — createNotification called with type rating_received', () => {
      expect(REVIEW).toMatch(/type: 'rating_received'/);
      expect(REVIEW).toMatch(/notificationService\.createNotification\(\{/);
    });

    it('BUG-PHASE125-01 — provider user_id resolved via SELECT user_id FROM providers WHERE id = $1', () => {
      expect(REVIEW).toMatch(/SELECT user_id FROM providers WHERE id = \$1/);
    });

    it('BUG-PHASE125-01 — notification emit lives OUTSIDE the trx (`.then` after) so a notify failure does not roll back the review', () => {
      // The trx returns the review, then the .then() runs the notify.
      expect(REVIEW).toMatch(/return review;\s*\}\)\.then\(async \(review\) => \{/);
    });

    it('BUG-PHASE125-01 — non-fatal error handling preserves the review even if notification fails', () => {
      expect(REVIEW).toMatch(/'rating_received notification failed \(non-fatal\)'/);
    });
  });

  describe('Mobile customer notifications icon map + routing', () => {
    it('BUG-PHASE125-01 — pre-fix `review_received: Star` is gone', () => {
      expect(CUSTOMER_NOTIFS).not.toMatch(/^\s*review_received: Star,/m);
    });

    it('BUG-PHASE125-01 — `rating_received: Star` mapping present', () => {
      expect(CUSTOMER_NOTIFS).toMatch(/rating_received: Star,/);
    });

    it('BUG-PHASE125-01 — chat notification icons added (was missing — fell back to Bell)', () => {
      expect(CUSTOMER_NOTIFS).toMatch(/new_message: MessageSquare,/);
      expect(CUSTOMER_NOTIFS).toMatch(/chat_started: MessageSquare,/);
      expect(CUSTOMER_NOTIFS).toMatch(/chat_last_message: MessageSquare,/);
    });

    it('BUG-PHASE125-01 — cancellation icons added (was Bell fallback)', () => {
      expect(CUSTOMER_NOTIFS).toMatch(/customer_cancelled: Ban,/);
      expect(CUSTOMER_NOTIFS).toMatch(/provider_cancelled: Ban,/);
    });

    it('BUG-PHASE125-01 — routing branch uses rating_received not review_received', () => {
      expect(CUSTOMER_NOTIFS).toMatch(/notif\.type === 'rating_received'/);
      expect(CUSTOMER_NOTIFS).not.toMatch(/notif\.type === 'review_received'/);
    });
  });

  describe('Mobile provider notifications icon map + routing', () => {
    it('BUG-PHASE125-01 — every pre-fix wrong key is gone from the map', () => {
      // Lock the eight stale keys out — none should appear as map keys.
      expect(PROVIDER_NOTIFS).not.toMatch(/^\s*new_booking: ClipboardList,/m);
      expect(PROVIDER_NOTIFS).not.toMatch(/^\s*booking_assigned: CheckCircle2,/m);
      expect(PROVIDER_NOTIFS).not.toMatch(/^\s*payment_received: Coins,/m);
      expect(PROVIDER_NOTIFS).not.toMatch(/^\s*dispute_opened: Scale,/m);
      expect(PROVIDER_NOTIFS).not.toMatch(/^\s*review_received: Star,/m);
      expect(PROVIDER_NOTIFS).not.toMatch(/^\s*payout_completed: Banknote,/m);
      expect(PROVIDER_NOTIFS).not.toMatch(/^\s*tip_received: Gift,/m);
    });

    it('BUG-PHASE125-01 — actual API-emitted types are mapped', () => {
      expect(PROVIDER_NOTIFS).toMatch(/new_job_available: ClipboardList,/);
      expect(PROVIDER_NOTIFS).toMatch(/job_completed: CheckCircle2,/);
      expect(PROVIDER_NOTIFS).toMatch(/payment_released: Coins,/);
      expect(PROVIDER_NOTIFS).toMatch(/dispute_update: Scale,/);
      expect(PROVIDER_NOTIFS).toMatch(/rating_received: Star,/);
      expect(PROVIDER_NOTIFS).toMatch(/tier_upgrade: Award,/);
      expect(PROVIDER_NOTIFS).toMatch(/nbi_expiring: AlertTriangle,/);
      expect(PROVIDER_NOTIFS).toMatch(/provider_approved: Shield,/);
      expect(PROVIDER_NOTIFS).toMatch(/provider_suspended: Ban,/);
      expect(PROVIDER_NOTIFS).toMatch(/customer_cancelled: Ban,/);
      expect(PROVIDER_NOTIFS).toMatch(/new_message: MessageSquare,/);
    });

    // Routing is covered by the rendered-screen behavior test at
    // apps/mobile/__tests__/bug-phase125-01-notification-routing.test.tsx.
    // Keep this API-side file focused on the emitted type and icon-key contract.
  });
});
