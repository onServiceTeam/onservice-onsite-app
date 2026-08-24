# D30 — Provider-staff access to customer conversations

Date: 2026-08-25
Status: OPEN — authorization and product decision required
Raised from: provider-staff job workflow audit

## Decision

Should an approved provider team member assigned to a booking be allowed to read and write the booking's customer/provider conversation?

## Evidence

The assigned-staff job screen exposed a `Chat with Customer` action that routed to `/provider/chat/:bookingId`. That route group permits only provider-owner accounts, so a `provider_staff` session was redirected back to staff jobs before chat opened.

The API is also deliberately two-party today:

- `conversations` stores only `customer_id` and provider-owner `provider_id`;
- conversation reads, messages, unread counts, message reports, and socket room access require one of those two user IDs;
- no participant or assignment snapshot records when a staff member gained or lost access;
- an assigned staff member reading the existing thread would also receive messages created before their assignment.

Changing only the mobile route guard would therefore create a misleading screen and would not authorize the API. Broadening the provider route group would also expose provider-owner navigation and settings to staff.

## Options

### Option A — Assignment-scoped shared booking conversation (recommended)

- Keep one booking conversation visible to the customer and provider owner.
- Permit an approved, currently assigned staff member to read and write it.
- Show the actual sender name and role for every message.
- Record access from assignment start and define whether earlier history is visible.
- Revoke access immediately when assignment or approval ends.
- Send customer and provider-owner notifications with the staff actor identified.
- Apply the same rule to socket joins, unread counts, reporting, exports, and admin moderation.

Benefits: customer context stays in one support-visible record and the assigned worker can coordinate on site.

Tradeoff: requires an explicit participant/access model and a decision about pre-assignment history.

### Option B — Separate staff-to-owner channel

- Staff coordinate only with the provider owner.
- The owner remains the sole customer-chat participant.

Benefits: smallest customer privacy change.

Tradeoff: the owner becomes a relay during active field work and some coordination may leave onService.

### Option C — No staff messaging

- Staff use job tasks/evidence and contact support for platform issues.

Benefits: no messaging-model change.

Tradeoff: weak day-of-service coordination and a strong incentive to use calls or external messaging.

## Recommendation

Approve Option A with access beginning at assignment time, unless the provider owner explicitly grants earlier thread history. The message UI and admin record should identify the staff sender rather than presenting every provider-side message as the owner.

## Safe behavior while open

- Do not route staff into the provider-owner chat stack.
- Do not broaden the provider route guard to `provider_staff`.
- Replace the broken chat action with the existing booking-linked support path and explain that customer chat remains with the provider owner.
- Continue staff checklist, evidence, on-site status, and completion work that already has assigned-staff API authorization.
