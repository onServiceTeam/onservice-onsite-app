# Customer human audit (October 13, 2026): gap analysis and build plan

Written by Claude Code on October 13, 2026, from 14 read-only investigations: 9 code readers covering home, service flow, quote engine, dispatch and notifications, messaging, uploads, admin insights, the app updater and the design system, plus 5 online research reports. The raw reports have file and line references. They stay in the private, git-ignored folder `qa-frameworks/human-audit-2026-10-13/raw-agent-reports/` because they describe weak spots on the live server and this repository is public.

Inputs: Ken's notes (`00-KEN-NOTES-VERBATIM.md`), Ken's October 10 brief (`01-QUOTE-BASED-BOOKING-BRIEF-2026-10-10.md`), and Ken's follow-up: customers enter a **budget range** that providers see.

Checked against commit `4a75eec4`, which is what runs on the live tester server (API image `97e4318f`).

---

## Bad news first

1. **The "Update" button in the app never installs anything itself.** It opens the phone's browser and then forgets about it. It never checks whether the install happened. The live server, the APK file, the signing key and the version numbers are all correct; we checked every one. The most likely failure: the phone opens the old `onService-1.0.1-2.apk` still sitting in Downloads, "reinstalls" the same version, and the app keeps saying "Update available". The fix needs a new APK (1.0.3), and every tester must install that one by hand once. After that, updates install from inside the app.
2. **Android phones very likely get no push notifications at all.** The APK is built without the Firebase setup that Android push needs. So providers only see new requests while their app is open. Turning push on needs a Firebase project, which only Ken can create. Until then, the 5 to 10 minute admin alerts are the safety net.
3. **Providers cannot see customer photos before they quote.** They see "2 photos" as a count only.
4. **The "New job" pop-up for providers almost never connects.** The provider screens never open the live connection it listens on.
5. **Nobody is told when a quote arrives, is accepted or is declined.** The screens even promise it.
6. **There is no first-come-first-served today.** Up to 5 providers can quote at once. Declined quotes still count toward the limit, so a request can get stuck with nobody able to quote.
7. **A "same day" request can become impossible to pay.** Its job time is invented as "now plus 4 hours", and payment is refused once that time passes.
8. **Customers still cannot pay with real money** (card, GCash and Maya are off under E14). After a match, only a wallet balance can pay. This plan does not change that; it is Ken's PayMongo decision.
9. **4 of 10 live categories have no services.** All 29 live services have a blank description, so the app shows "SCOPE DETAILS PENDING" on them.

---

## What Ken asked for, and what exists today

| # | Ken wants | What exists today | Gap |
|---|---|---|---|
| 1 | First screen looks like a serious, large brand, not a game | Rainbow pastel tiles, generic symbol icons (sparkles for cleaning, snowflake for aircon, hammer for roofing and landscaping), no brand font, text-only "oS" logo | Redesign |
| 2 | A clear page title such as "Book a service" | No title at all. The top of the screen is an avatar, an address picker and "Welcome back" | Add title |
| 3 | Icons that show what the service is | Wrong or generic icons | Remap to accurate icons from the icon set we already use |
| 4 | Service page looks serious and does not show a set price | Prices on every service card ("Starting at ₱350"), shown in a plain list and a small pop-up | Redesign, remove set prices |
| 5 | Tapping a service opens a "describe your job" screen with text, photos, video and a voice note | Only "custom quote" services open such a form. It needs 50+ characters and 2+ photos. There is no video, no voice and no "not sure" budget option | Extend the form, make every service start here |
| 6 | Budget range the providers can see, or "I don't know the price" | Budget min/max exists and providers see it. No "not sure" choice | Add "Not sure" and a price guide |
| 7 | Request goes to every matching provider in the background; the first one to respond is the only one | Request goes to up to 30 providers in no particular order; up to 5 can quote at once | Build first-come-first-served |
| 8 | Customer accepts or declines that provider's quote | Accept and decline exist (built for comparing several quotes) | Reuse |
| 9 | If declined, the request goes back to the other providers with a signal | Decline only changes the quote's status. No re-send, no signal, and the request can stay stuck | Build re-open with signal |
| 10 | Message thread between customer and provider | Chat only exists after a provider is assigned to a paid booking. Text and photos only. Messages show in the wrong order and photo captions are hidden | Thread from the first response, voice and photo, fix the bugs |
| 11 | Providers get enough detail to price the job | Text, budget and question answers, but photos as a count only | Show photos, video, voice and answers |
| 12 | Admin sees every request nobody answered | Nothing. Expired requests are marked as "cancelled by admin" with no reason | Build insights page |
| 13 | Admin alert when a provider takes more than 5 to 10 minutes | Nothing | Build alerts |
| 14 | After the match: confirm the booking, then pay | Accepting a quote jumps to payment with an invented job time | Add a confirm step using the provider's proposed time |
| 15 | APK update works | Browser hand-off, never checked | Install from inside the app (1.0.3) |

---

## How the first-come-first-served flow will work

The brief (October 10) says up to 5 providers quote and the customer compares. Ken's notes (October 13) say the first provider to respond is the only one. Both are kept in one engine with one admin setting: **how many quotes a request can have open at once**.

- Set to **1** (the default, from Ken's October 13 notes): first come, first served.
- Set to **5**: the brief's compare mode.

Step by step, with the default of 1:

1. **Customer** picks a service and lands on "Book a service: Aircon repair". They describe the job in any mix of the quick questions, text, photos, a short video (30 seconds or less) and a voice note (60 seconds or less). They enter a budget range, or tick "Not sure, let the pro quote". Then they pick when and where.
2. **Every eligible provider** is notified in the background: approved, offers that service, covers that area. They see the area and distance, never the exact address. They also see the description, photos, video, voice note, answers and budget.
3. **The first provider to send a quote** gets the request. A quote is a price, what is included, what could change it, and the earliest date and time they can come. They can also tap "Accept the customer's budget" in one step. Everyone else sees "Another pro is handling this request", and it leaves their list.
4. **Customer and that provider can message each other** in the request thread (text, photos, voice notes).
5. **The customer accepts or declines.**
   - **Accept:** a confirm screen shows the price, the provider, the date and time the provider proposed, the address and the cancellation summary. Then the existing payment step runs.
   - **Decline:** the customer gives a reason (too expensive, timing, other). The request opens again to every other eligible provider. They see "The customer declined an earlier quote. Reason: price above budget", but **not the declined amount**. Showing it would anchor everyone's price; the research behind that is in the private reports. The declined provider cannot quote again on this request. After 3 rounds without a deal, the request is flagged for the back office.
6. **Admin**:
   - a live queue of waiting requests with a timer;
   - an amber alert at 5 minutes with no response and a red one at 10 (both editable);
   - a lost-opportunity list with the reason each request failed;
   - response times per provider;
   - a coverage grid by area and category.

Every number above is an admin setting, following Ken's standing rule that defaults stay editable in admin.

---

## Build order (strict dependency order; each piece verified before the next)

**Milestone 1: ship first (APK 1.0.3 plus web)**

1. **App updater fix.** The app downloads the update itself and shows progress. It checks the file's size and fingerprint, then opens Android's installer. When the person comes back, it checks whether the version changed, and says clearly if the install did not finish and why. The help text names the exact file.
2. **Home screen redesign.**
   - "Book a service" title and an onService wordmark.
   - Search that asks for the problem ("Describe the problem, e.g. aircon not cooling").
   - One calm tile style with accurate icons; no rainbow.
   - The approved Inter font.
   - Empty categories go straight to "describe your job" instead of a dead end.
3. **Service page redesign.** No set prices. A short "how pricing works" box answers the scam worry: the price is agreed in the app before work starts, and pay only in the app. Every service leads to "describe your job". The fixed-price flow stays in the code behind an admin switch.

**Milestone 2: the request, response and booking loop (APK 1.0.4 plus web and API)**

4. **Database changes** (additive only, nothing dropped):
   - a record of every provider notified per request, with times;
   - private request media;
   - "not sure" budget;
   - request rounds;
   - threads per request and provider;
   - voice messages;
   - admin alerts;
   - the new settings.
5. **Private media upload.** Photos, video and voice. Uploads go in small pieces so weak mobile data can resume, and location data is removed. Only the customer, the providers invited to that request and admins can view, through links that expire.
6. **First-come-first-served engine.** First quote wins under a database lock. The open-quote limit counts only live quotes, decline re-opens the request with a signal, rounds have a limit, and everyone involved is notified.
7. **Request thread.** Customer and responding provider message each other with text, photos and voice notes. Fix the wrong message order, the hidden captions and the 100-message cap, and keep live updates alive past 15 minutes.
8. **Confirm and pay.** The confirm screen uses the provider's proposed time. The existing wallet payment path is unchanged.
9. **Provider side.** Live connection on the provider screens so new requests appear at once. A requests inbox with photos, video and voice. A quote form with "Accept the customer's budget". A "my quotes" status list.

**Milestone 3: back office (admin web plus API)**

10. **Marketplace health page:**
    - a live waiting queue;
    - time to first response;
    - lost opportunities with reasons;
    - provider responsiveness;
    - a coverage grid;
    - a "who was notified" history on each booking.
11. **Alerts:** a one-minute check, an amber and red banner in admin with a count, and an optional Slack alert if a webhook is set.

After each piece: tests (real renders and real database), an independent review that tries to break it, GitHub CI green, then deploy to the live tester server and, for app changes, a new APK. This follows Ken's "machine, GitHub and live stay in sync" rule.

---

## What this plan does not do (needs Ken or someone else)

- **Push notifications on Android:** needs a Firebase project (Ken's Google account). Steps will be written down.
- **Real card, GCash or Maya payments:** E14, Ken's PayMongo choice and test keys.
- **A real app icon and logo:** needs brand artwork. The current "oS" text mark stays until then.
- **Real photos of Cebu providers** for category and provider cards: needs real, permitted photos. No stock models and no AI-generated people, which would undercut trust.
- **Service descriptions:** the 29 blank descriptions are content for admin to fill in. Where pricing is by quote, the app no longer shows "pending" labels.
- **Hiding phone numbers and contact details typed into chat** (brief Feature 5): in June Ken said no masking (D26), but the October brief asks for it. This conflict is listed in D38 for Ken. Today's keyword flagging stays.
- **In-app voice and video calls:** still waiting on D26 and E13.
- **Trust wording such as "guaranteed" or "protected":** held for the attorney (E10, F#10). The new screens only state facts that are true today.

The decisions made for this plan, and the questions still open for Ken, are in `.ai-coder/decisions/D38-request-first-booking-and-first-response-dispatch.md`.
