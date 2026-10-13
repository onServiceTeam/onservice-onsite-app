# D38: Request-first booking and first-response dispatch

Status: **Ken decided 2026-10-13** in his human-audit notes (`docs/qa/human-audit-2026-10-13/00-KEN-NOTES-VERBATIM.md`) and his follow-up message the same day. Design by Claude Code, 2026-10-13. Defaults that Claude chose where the notes are silent are marked **[default]**. Every one of them is an admin setting, and all are listed again at the end for Ken to confirm or change.

## What Ken decided

1. **No set price on the service page.** Tapping any service opens a screen where the customer describes the job, because two jobs under the same service rarely cost the same.
2. **Rich job description.** Written text, photos, video and a recorded voice explanation.
3. **Budget.** The customer can enter a budget **range** that providers see. A customer who has no idea of the price can say so.
4. **First come, first served.** The request reaches every matching provider in the background. The provider who responds first is the only one assigned to it.
5. **Accept or decline.** The customer accepts or declines that provider's quote. If they cannot make a deal, the request goes to the other providers, with a signal that the customer declined an offer.
6. **Message thread** between customer and provider.
7. **Admin insights and alerts.** Admin sees every request nobody answered, and is alerted when a provider takes more than 5 to 10 minutes to respond.
8. **After the match**, the booking is confirmed and then paid.
9. **Ken's October 10 brief** ("Quote-Based Booking Coder Brief", copy in `docs/qa/human-audit-2026-10-13/01-...`) is part of the spec. That covers quick questions, optional media, private media, area-only location before booking, idempotency, admin-editable numbers and server-enforced limits.

## How the conflicts were resolved

- **Brief and SPEC.md vs Ken's notes on the number of quotes.** The brief (up to 5 quotes, customer compares) and `docs/architecture/SPEC.md` (max 5 quoting providers) conflict with Ken's October 13 notes (first responder only). Resolved with one engine and one admin setting, `request_max_open_quotes`:
  - default **1**, Ken's latest instruction;
  - setting it to **5** gives the brief/SPEC compare mode.

  SPEC.md is not rewritten. This file supersedes its "maximum 5 providers can quote" line while the setting is 1.
- **Photos required vs optional.** The code and SPEC require at least 2 photos. The brief says media is optional. Ken wants as much information as possible. Decision: no single item is required, but a request must carry **at least one** of: a written description (10+ characters), a photo, a video, a voice note, or answers to the quick questions. **[default]**
- **Fixed-price flow.** The brief says keep it working. A new setting, `request_first_booking` (default **on**), sends every service to the describe-your-job flow. Turning it off restores the old catalog flow. No catalog data is rewritten.
- **D26 "no phone-number masking"** (June) is about masked phone calls through the phone network. It is not about hiding contact details typed into chat, which the brief's Feature 5 asks for. These are different things, so there is no conflict. Chat masking is still **not built** in this round and stays an open item. Today's keyword flagging continues.
- **E33** (fixed-price dispatch before payment) is untouched. E33 itself says quote-request discovery is a separate contract. Fixed-price instant-pay dispatch is not changed by this work.
- **Test `bug-link-133-quoted-request-remains-a-lead`** pinned open bidding. It stays true when the open-quote setting is above 1. A new test covers the default of 1.

## Design

**What "respond" means [default].** A provider responds by sending a quote: a price, what is included, what could change the price, and the earliest date and time window. There is no "claim first, price later" step, so nobody can hold a request without pricing it. A provider can tap "Accept the customer's budget", which fills the price with the top of the customer's range.

**Who is invited.** Approved and online providers who:
- offer the service, or its category;
- cover the job location within their service radius;
- are not the customer;
- have not already been declined on this request.

They are ordered by distance and rating, using the existing matching score. Up to `request_max_invites` per round (default **30**, today's cap). **[default]** Every invite is recorded with the time it was sent, viewed and answered. That record feeds the admin insights.

**Lock.** The first valid quote locks the request under a database row lock. With the setting at 1, later quotes get "Another pro already responded to this request", and the request leaves the other providers' lists right away. Declined, withdrawn and expired quotes do not count toward the limit. That also fixes today's bug where declined quotes used up the limit.

**Decline.** The customer gives a reason: too expensive, timing does not work, changed my mind, or other.
- The request opens again (round + 1) to everyone eligible except providers already declined.
- They are told "The customer declined an earlier quote. Reason: …".
- The declined amount is **hidden [default]**, setting `request_show_declined_amount` = off.
- After `request_max_rounds` (default **3**) declined rounds, the request is flagged for the back office. **[default]**

**Budget.** Optional min and max in pesos, or "Not sure, let the pro quote".
- A quote above the budget is allowed **[default]**. The customer sees how far above the budget it is.
- When admin has set a price range for a service, the form shows it as a guide, labelled as an onService guide.

**Media.** Limits:
- up to 6 photos;
- 1 video of 30 seconds or less;
- 1 voice note of 60 seconds or less.

Handling:
- Stored privately. Viewable only by the customer, the providers invited to that request, and admins, through links that expire.
- Location data is removed from photos and from video metadata.
- Uploads go in small pieces so a weak connection can resume.

**Thread.** One thread per request and provider. It opens when that provider sends a quote. It goes read-only when the quote is declined or another provider is booked. Types are text, photo and voice note. The booked job keeps the same thread.

**Confirm and pay.** Accepting a quote shows a confirm screen first:
- price;
- provider;
- the date and time the provider proposed;
- address;
- cancellation summary.

On confirm, the existing server-side accept runs. It sets the price and records the price terms, and the job time becomes the provider's proposed time instead of an invented one. Then the existing wallet payment runs. **No money logic changes.**

**Admin.**
- A Marketplace health page:
  - live waiting queue with a timer;
  - time to first response;
  - lost opportunities with a reason code;
  - per-provider responsiveness;
  - coverage by area and category.
- On each booking, a history of who was notified.
- Alerts, checked every minute: amber at `ops_request_alert_amber_minutes` (default **5**), red at `ops_request_alert_red_minutes` (default **10**). Shown as a banner with a count on every admin page. Also sent to Slack when the existing Slack webhook setting is filled in.

## Open questions for Ken (defaults are live until he answers)

1. Should the open-quote setting stay at **1** (first come, first served), or should we move to 2 or 3 parallel quotes? The research suggests watching how often the first quote is accepted. Below 50% is a signal to allow 2 or 3.
2. Should the next providers see the **amount** the customer declined? (Default: no.)
3. How many decline rounds before the back office steps in? (Default: 3.)
4. Should a quote above the customer's budget be **allowed with a warning** (default) or **blocked**?
5. Should top-rated providers get a short head start before everyone else is notified? (Default: no, everyone at once.)
6. Should we add an "inspection visit" quote type? That is a capped visit fee credited against the repair, for jobs that cannot be priced from photos. Not built yet; it touches money rules.
7. Should contact details typed into chat (phone numbers, Messenger links) be hidden, as the October 10 brief asks? Not built yet.
8. **Push notifications on Android need a Firebase project** created in Ken's Google account. Until then, providers see new requests only while the app is open.
