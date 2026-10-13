# Milestone 2 and 3 plan: request, response, booking and back office

Written by Claude Code on October 14, 2026. This is the plain-English summary. The detailed design came out of five area designs, a synthesis and a hostile critique, with exact SQL, contracts and test lists. It is kept privately in `qa-frameworks/human-audit-2026-10-13/` (merged.md, critique.md, design-*.md), because it describes weak spots on the live server. Where the critique and the merged plan disagree, the critique wins.

Milestone 1 (live since October 14, d7b696ec, APK 1.0.3) is described in `02-GAP-ANALYSIS-AND-PLAN.md` and LAUNCH-LIMITATIONS section 131.

## Bad news first

1. **Milestone 2 needs APK 1.0.4.** Quotes will need the provider's earliest date and time window, and declines will need a reason. Older apps (1.0.2, 1.0.3) get "Please update the app" for those two actions. Thanks to 1.0.3's updater, 1.0.4 should install from inside the app.
2. **Voice and video need two more of Expo's own modules,** `expo-audio` and `expo-video` (free, first-party, SDK 55). Ken asked for voice and video, so they are treated as approved. Ken can say no.
3. **The job time of a quote booking changes source.** It comes from the time the provider proposed, instead of today's invented "now plus 4 hours". Three money rules read that time:
   - the customer no-show rule;
   - the dispute auto-refund rule;
   - the cancellation refund tier.

   The first two are not changed (E83).
4. **The first deploy reopens or closes old stuck requests on live.** These are requests whose quotes all expired. Old rows reopen silently. They are tester data, but this is still a write to live rows.
5. **Android push is still off,** so providers only see new requests while their app is open. The admin alerts in Milestone 3 are the safety net.

## How a request moves (default settings)

1. **The customer sends a request.** The request is the existing quote booking row. It now also records:
   - its round;
   - whether the customer said "not sure" about the budget;
   - a client request id, so a double tap never creates two requests.
2. **Every eligible provider is told, best match first, up to 30 per round.** Eligible means approved, available, offers the service, covers the location and is not the customer. Each provider told is recorded (sent, viewed, quoted, declined, taken, expired), with times. Requests also appear in eligible providers' Requests list.
3. **The first provider to send a quote gets the request.** The quote has a price, what is included (up to 300 characters), what could change it, and the earliest date and window (morning, afternoon, evening or as soon as possible).
   - A database lock means exactly one quote wins, even when two arrive at the same moment.
   - Everyone else gets "Another pro already responded to this request", and the request leaves their list.
   - The setting `request_max_open_quotes` (default 1) can be raised to 5 for the brief's compare mode.
4. **The customer and that provider can message each other** in a thread that opens with the quote. They can send text, photos and voice notes. The thread turns read-only if the quote is declined, withdrawn or expires, or if another provider is booked.
5. **The customer accepts or declines.**
   - **Accept:** a confirm screen shows the price, the provider, the proposed date and time, the address and the cancellation summary. On confirm, the job time is the later of the window start and "now plus 60 minutes". If the window has already ended, it cannot be confirmed. Then the existing wallet payment runs. Price, fee and recorded terms are unchanged.
   - **Decline:** a reason is required (price too high, timing, changed mind, other). The request opens again to everyone else eligible. They are told the reason but not the amount, unless `request_show_declined_amount` is turned on. The declined provider cannot quote again. After 3 declined rounds the request is flagged for the back office.
6. **A provider can withdraw their quote.** The request then reopens to others.
7. **If nobody responds:**
   - after 30 minutes the customer sees an honest "still looking" notice;
   - after 72 hours the request closes as "expired, no pro responded", recorded with that reason instead of "cancelled by admin".
8. **Customer-side guards.** A customer can no longer assign a provider straight onto a quote request, or start the fixed-price dispatch on one. Admin reassignment of a quote request is also blocked.

## Private media

- **Limits:** up to 6 photos, 1 video of 30 seconds or less, and 1 voice note of 60 seconds or less. All are admin settings.
- **Uploads go in small pieces,** so they resume on weak mobile data and stay under the live server's size limit.
- **The server checks the real file type and the video length itself.** It removes location data from photos and from phone video metadata (iPhone and Android location tags).
- **Files are private.** Only the customer, providers invited to that request, the booked provider and admins can view them, through links that expire within 10 minutes. Admin views are logged.
- **Admin** sees the media on the booking page.

## Provider app

- **Live updates while the app is open.** The live connection now stays up past the 15-minute sign-in refresh, with a refresh every 30 seconds when it is down. New requests pop up with a vibration.
- A Requests tab with an unseen count.
- **The request detail** shows photos, video and voice.
- **The quote form** has a "Use the customer's budget" button, an optional itemized breakdown, and a "taken" state when another pro got there first.
- **My quotes** shows waiting, accepted, declined (with the reason), not selected and expired.

## Customer app

- A request status screen: "We sent your request to N local pros", then "still looking" or "quote ready".
- **Quote cards** show:
  - the price;
  - "within your budget" or "X above your budget";
  - what is included and what could change it;
  - the earliest slot;
  - the rating, or "New on onService" under 3 reviews.

  There is no "Verified" badge until that wording is approved.
- Accept goes to the confirm screen. Decline asks for a reason.
- A Messages tab with one thread per provider. Chat bugs are fixed:
  - messages now show in the right order;
  - photo captions appear;
  - older messages load;
  - voice notes play.

## Back office (Milestone 3)

- **A Marketplace page:**
  - a live waiting queue with a timer since each request opened or reopened;
  - time to first response (middle and slowest 10%) by category and city;
  - lost opportunities, each with one reason (no eligible provider, nobody viewed, nobody responded, declined every round, customer cancelled while waiting, expired);
  - provider responsiveness;
  - a coverage grid by area and category.
- **Alerts, checked every minute:**
  - amber after 5 minutes with no live quote and red after 10 (admin settings);
  - "needs back office" after 3 declined rounds.

  They show as a banner with a count on every admin page, with Acknowledge (logged) and Call provider (the existing logged phone reveal). Slack is used if the Slack webhook is set.
- **On each booking,** a "Who was notified" history.

## Build order and checks

1. **Wave 1:** database migrations 183 (engine) and 184 (media), settings, notification types and event names.
2. **Wave 2, in parallel:** the engine (quotes, decline, withdraw, confirm, workers), private media, and threads with the live-connection server (migration 185).
3. **Wave 3:**
   - wire media into requests and threads;
   - the provider and customer screens;
   - the admin panels.
4. **Release:**
   - full test suites;
   - rehearse migrations 183-185 on a copy of the live database;
   - migrate and switch the API in one step (the thread change needs both together);
   - publish web;
   - APK 1.0.4.
5. **Milestone 3:** migration 186, insights, alerts and the admin page.

Each package is built, then checked by two independent reviewers: one looks for bugs and race conditions, the other checks test honesty and the plan. Then it is fixed. Every behaviour has a real database or real screen test.

## Questions for Ken (defaults are used until he answers)

1. **Job time:** is the window start (or confirmation + 60 minutes) right? For window bookings, should the no-show clock start at the window start or the window end? (E83)
2. **Short wallet:** should "Confirm booking" be blocked when the wallet cannot cover the total? Default: blocked, so no booking is left stuck unpaid.
3. **Cancellation on the confirm screen:** default is intro text plus a link, with no percentages until E09 is settled.
4. **"Verified" badge on quote cards:** default none, until the wording is approved.
5. **Apps older than 1.0.4 cannot quote or decline:** default accepted.
6. **Idle customer:** a customer who never answers holds the request for the quote's life (48 hours). Should that hold be shorter?
7. **Who sees requests:** every eligible provider sees requests in their list (default), or only providers who were notified?
8. **Media retention:** proposed 12 months after the booking closes. Should data-export requests include the files or only a list?
9. **Customer name shown to providers before booking:** first name and last initial (default).
10. **First deploy:** may the worker reopen, then later close, old stuck requests on live?
11. **Alerts:** around the clock or ops hours only, and should amber also go to Slack?
12. **Booked thread after completion:** stays open (default), or closes 7 days after completion as the brief says?
13. **Withdrawn quotes:** may a provider withdraw a quote (default yes)? May a provider whose quote expired quote again (default no)?
14. **Admin assignment:** may admins assign a provider straight onto a quote request? Default no.
