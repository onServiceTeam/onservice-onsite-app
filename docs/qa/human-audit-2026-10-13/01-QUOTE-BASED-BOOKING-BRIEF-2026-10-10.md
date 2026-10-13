# Quote-Based Booking Coder Brief (October 10, 2026), text copy

Plain-text copy of Ken's brief "onService PH — Quote-Based Booking Coder Brief.docx" (by Kendreck Moultry, dated Oct 10, 2026), extracted October 13, 2026 so the spec lives in the repo. Tables were flattened to one cell per line by the extraction. The state diagram from the document is saved next to this file as 01-brief-state-diagram.png.

```text
onService PH — Quote-Based Booking: Coder Brief
Oct 10, 2026 · @Kendreck Moultry
How to use this brief
Build this in the phases at the end of this brief, one phase at a time, and do not start the next phase until the current one passes the audit checklist.
Instructions to the AI coder:
Read the whole brief before writing any code. Then reply with: a short summary in your own words, every question or ambiguity you found, and the database changes you propose against the existing code. Wait for approval.
Work inside the existing onService PH codebase and its current stack. Do not add new frameworks, paid services or payment providers without asking first.
Database first. Write and run the migrations for the data model before building any screen.
Keep the existing fixed-price booking flow working. Quote-based booking is added alongside it, switched on per service category.
Small, focused commits. Each commit message says what changed and why.
Put every number marked "configurable" in an admin setting or config table, never hard-coded.
All permission checks, deadlines and limits are enforced on the server, never only in the app.
Secrets (API keys, passwords) live in environment variables, never in the code or the repository.
Every phase ends with a debug APK that installs and opens on a real Android phone. A phase without a working APK is not done.
If anything in this brief conflicts with the existing code or is unclear, stop and ask. Do not guess.
Overview
Customers describe a job instead of picking a fixed price; up to 5 nearby providers send their own quotes within about 2 hours; the customer chooses on price and reputation side by side; and all contact stays inside the app, where attempts to take the deal off-platform are detected.
This solves the core problem that no two units, homes or repairs are the same, so one fixed price is always wrong for someone.
Role
What they do in this flow
Customer
Describes the job, optionally adds photos, a voice note or a video, compares quotes, chats, books
Provider
Receives invites for nearby jobs, views the details, asks questions, sends one quote, does the job
Admin (operator)
Sees every request, quote, chat and flag; configures the rules; warns, suspends or removes users; settles disputes
Design principles:
The easy path stays easy. A customer can post a job in under 60 seconds without typing; extra detail is always optional.
An invite, not an auction. A small number of providers are invited, quotes are private, and the window is short.
Informed choice. Price is shown next to rating, jobs completed, reliability and distance.
Keep it on the platform. The guarantee, support and dispute help only cover in-app bookings, and the app says so.
The operator sees everything and can step in at any point.
Out of scope for this brief: the payment mechanics themselves. Use the app's existing payment flow; this brief ends at a confirmed booking with an agreed price, plus in-app price change requests.
Data model
Add these tables (or extend existing ones where they already exist) before building any screen. Store money as whole centavos in integer columns, store times in UTC and display them in Asia/Manila time.
Table
Purpose
Key fields
service_categories (extend)
Per-category rules
quote_mode (fixed, quote, both), intake_questions (JSON), quote_window_minutes (default 120), max_invites (default 8), max_quotes_shown (default 5), invite_radius_km (default 15)
job_requests
The customer's job
customer_id, category_id, address_id, area label (barangay, city), lat, lng, answers (JSON), note (max 500 chars), preferred_date, time_window (morning, afternoon, evening, ASAP), status, quote_deadline_at, idempotency_key, cancelled_reason
job_media
Photos, voice notes, videos
job_request_id, type (photo, voice, video), storage_key, thumbnail_key, duration_seconds, size_bytes
quote_invites
Which providers were asked
job_request_id, provider_id, wave (1 or 2), status (sent, viewed, quoted, declined, expired), decline_reason, sent_at, viewed_at, responded_at
quotes
A provider's offer
job_request_id, provider_id, invite_id, price_centavos, included (max 300 chars), could_change_if (optional), earliest_date, earliest_time_window, status (submitted, withdrawn, accepted, not_selected, expired), unique on (job_request_id, provider_id)
bookings (extend)
Confirmed job
quote_id, agreed_price_centavos
price_change_requests
Price change after booking
booking_id, provider_id, new_price_centavos, reason, photo keys, status (pending, approved, rejected)
conversations
One chat per job and provider
job_request_id, customer_id, provider_id, state (open, read_only, closed)
messages
Chat messages
conversation_id, sender_id, type (text, photo, voice, system), body, masked_body, media_key, was_masked, created_at
calls
In-app call log (no recordings)
conversation_id, caller_id, type (voice, video), started_at, ended_at, duration_seconds
detection_rules
Off-platform rules, admin-editable
name, pattern, kind (regex, keyword), language, severity (low, medium, high), action (mask, warn, flag), active
moderation_flags
Detected attempts
message_id, conversation_id, user_id, rule_id, severity, status (open, dismissed, warned, actioned), reviewed_by, reviewed_at, notes
enforcement_actions
Warnings, suspensions, bans
user_id, action (warning, suspension, removal), reason, flag_id, starts_at, ends_at, issued_by (system or admin id)
provider_stats
Numbers shown on quote cards
provider_id, rating_avg, rating_count, jobs_completed, repeat_customers, on_time_rate, completion_rate, avg_response_minutes, updated_at
disputes
Problems after booking
booking_id, opened_by, reason, status, resolution, refund_centavos
admin_audit_log
Every admin action
admin_id, action, target_type, target_id, details (JSON), created_at
Job request statuses: draft, collecting_quotes, ready_to_choose, no_quotes, booked, cancelled. The drawing below shows how a request moves between them. After booking, the existing booking lifecycle takes over.

job request statuses · 6 states
The customer can cancel at any point before Booked, which moves the request to cancelled, and can ask for one fresh round of quotes from Ready to choose. No quotes also alerts the admin.
Feature 1: Job request capture
A customer can post a job in under 60 seconds by tapping answers only; photos, voice and video are optional extras that help providers quote accurately.
Screen flow:
Pick a service.
Quick questions: 3 to 5 tap-to-answer questions per category (chips, number steppers, yes/no). No typing required. Questions come from the category's intake_questions config so the admin can edit them without a new app release.
Optional details, under the heading "Help pros quote accurately (optional)": add up to 6 photos, a voice note up to 60 seconds, a video up to 30 seconds, and a text note up to 500 characters.
When and where: saved or new address with map pin, preferred date, time window (morning, afternoon, evening) or "as soon as possible".
Review and submit. The confirmation says: "You'll get up to 5 quotes, usually within 2 hours."
Starting questions per category (admin-editable):
Category
Quick questions
Home cleaning
Number of bedrooms; number of bathrooms; last deep clean (under 1 month, 1 to 6 months, over 6 months, never); add-ons (inside fridge, inside oven, windows, move furniture)
Aircon cleaning and repair
Unit type (window, split, other); number of units; need (cleaning, not cooling, leaking, noisy, won't turn on); brand (optional)
Refrigerator repair
Type (single door, two door, side by side, other); problem (not cooling, leaking, noisy, won't turn on, other)
TV repair
Screen size; problem (no picture, no sound, lines on screen, won't turn on, other)
Plumbing
Problem (leak, clog, new install, low water pressure, other); location (kitchen, bathroom, outdoor, other)
Electrical
Problem (no power in an area, breaker keeps tripping, install outlet or light, wiring check, other)
Media rules:
Photos: resize to 1600 px on the longest side, JPEG quality about 80. Remove location data (EXIF GPS) before upload.
Video: 720p maximum, 30 seconds, about 20 MB cap. Generate a thumbnail.
Voice: compressed audio (AAC or similar), 60 seconds maximum.
Uploads show progress, retry automatically on a weak signal, and the customer can remove any item. If uploads keep failing, the customer can still submit without media.
Media is private. Only invited providers and admins can view it, through links that expire.
Other rules:
Auto-save the draft so a closed app does not lose the customer's work.
Use an idempotency key so a double tap or a retry never creates two job requests.
Before booking, providers see the area (barangay and city) and the approximate distance, never the exact address. The exact address and pin are shared with the booked provider only.
Feature 2: Quote dispatch
Each request goes to up to 8 eligible nearby providers, quoting closes after 120 minutes or once 5 quotes arrive, and the server enforces both limits (all numbers configurable per category).
Who is eligible for an invite:
Active, verified, not suspended.
Offers this service category.
Service area covers the job address (default radius 15 km).
Available on the preferred date, if the provider keeps a calendar in the app.
Not the same account as the customer.
Has fewer than a configurable number of open, unanswered invites (default 10), so busy providers are not flooded.
Who gets invited first: rank eligible providers by a weighted score of distance, rating, response rate and recent activity. Weights are admin settings. Reserve 1 of the 8 slots for a provider with fewer than 5 completed jobs, so new providers can build a track record.
Quote window rules:
The window starts when invites are sent. Default 120 minutes.
Quiet hours (default 9:00 pm to 7:00 am Manila time): requests posted then are sent at 7:00 am and the window starts then. The customer is told this on the confirmation screen.
Quoting closes at the first of: 5 quotes received, the deadline passes, or the customer books.
The customer may book as soon as the first quote arrives; they do not have to wait for the window to end.
When quoting closes, remaining invites become expired and those providers are told the job is closed.
No quotes at the deadline: send one second wave to the next 8 providers with the radius widened to 25 km and 60 more minutes. Still none: status becomes no_quotes, the customer is told, and admins are alerted to help by hand.
Provider quote form:
Field
Rule
Price
Total in pesos, required, greater than zero
What's included
Required, up to 300 characters
Could change if
Optional, for example "if the gas needs a full recharge"
Earliest slot
Date and time window, required
Quoting rules:
One quote per provider per job. The provider can edit or withdraw it until it is accepted.
The provider can decline with a reason: too far, not available, not my specialty, other.
Providers never see each other's prices.
The provider can open a chat to ask questions before quoting.
Prices far outside the category's usual range are allowed but flagged for admin review.
The 5-quote cap must be safe when several providers submit at the same moment. Use a database transaction or lock so exactly 5 are accepted; the 6th provider sees "This job already has enough quotes".
After booking, any price change goes through a price change request in the app, with a reason and optional photos, and only applies if the customer approves it.
Feature 3: Comparing and choosing
Quotes appear as cards with the price beside the provider's rating, jobs completed, reliability and distance, so a customer can knowingly pay more for a better pro or pick a cheaper one that still reviews well.
Each quote card shows:
Item
Shown as
Rule
Provider
Name, photo, Verified badge
Badge only if ID and skills checks passed
Price
Large, for example ₱1,800
From the quote
Rating
★ 4.8 (126 reviews)
Under 3 reviews: show "New on onService" instead of a score
Jobs completed
214 jobs on onService
Completed bookings only
Repeat customers
38 repeat customers
Customers who booked this provider 2 or more times
Reliability
96% on time
Shown only after 10 completed jobs
Distance
About 3 km away
Rounded; never the provider's exact location
Earliest slot
Tomorrow, morning
From the quote
What's included
One or two lines, expandable
From the quote
Response time
Quoted in 25 min
From the invite timestamps
Sorting and tags:
Default sort is "Best match": a weighted blend of rating, reliability, price compared with the other quotes, and distance. Weights are admin settings.
Other sorts: lowest price, highest rating, nearest.
Up to three tags, at most one card each: Lowest price, Top rated, Closest.
No paid placement in this version.
Actions:
Tap a card to open the full provider profile: reviews, photos of past work, years of experience, certifications.
Chat with any provider who quoted.
Accept a quote. A confirm screen shows the price, slot, address and cancellation policy. On confirm: a booking is created, the quote becomes accepted, all other quotes become not_selected, those providers are notified, and their chats turn read-only.
Not happy with any quote: request a fresh round once (new providers only), or cancel the request.
The quote list updates live as quotes arrive, without the customer refreshing.
Feature 4: Chat and calling
Customers and providers clarify details in an in-app chat, with in-app voice and video calls added later, and neither side ever sees the other's phone number.
Chat rules:
One conversation per job request and provider.
Before booking: an invited provider can message the customer once they open the invite; the customer can message any provider who quoted.
After booking: the chat with the booked provider stays open until 7 days after completion. All other chats for that job become read-only.
Message types: text, photo, voice note, and system messages (quote sent, quote changed, booking confirmed, price change requested, warning).
Real-time delivery, push notifications, read receipts. Messages typed offline are queued and sent when the connection returns.
Every message passes through the off-platform check (Feature 5) on the server before it is delivered.
Report and Block buttons in every chat.
Calling (later phase):
In-app voice calls first, video second, through a calling service. The coder proposes two or three options with monthly cost estimates before building.
Phone numbers are never exposed. Calls are logged (who, when, how long) but not recorded.
Privacy notice: at sign-up and on first chat, tell users that chats are checked automatically for safety and to protect the service guarantee, and may be reviewed by onService staff when a problem is reported or detected.
Feature 5: Off-platform protection
Every chat message is checked on the server before delivery: contact details are masked, suspicious phrases trigger a friendly warning to both sides, and every hit is logged as a flag for the admin.
What to detect:
What
Examples
Action
Philippine mobile numbers
0917 123 4567, +63 917 123 4567, 639171234567, with spaces, dashes or dots
Mask, warn both, flag high
Disguised numbers
"zero nine one seven…", "o9I7…", digits split across 2 or more messages
Mask, warn both, flag high
Landlines
(02) 8123 4567
Mask, warn both, flag high
Email addresses
name@gmail.com, "name at gmail dot com"
Mask, warn both, flag high
Social and messaging links
Facebook, Messenger (m.me), Viber, WhatsApp, Telegram, Instagram links or handles
Mask, warn both, flag high
Off-app payment
"cash na lang", "send to my GCash", "Maya na lang", bank account numbers
Warn both, flag medium
Contact requests
"call me", "text me", "text mo ko", "tawag ka", "PM me", "add me on FB"
Warn both, flag medium
Going direct
"direct na lang", "labas tayo sa app", "cheaper if direct"
Warn both, flag high
How to detect:
Normalize the text first: lowercase; turn number words in English and Filipino into digits; turn look-alike letters into digits (o to 0, l and I to 1); remove spaces, dashes and dots between digits.
Check each message, and also the sender's last 5 messages joined together, to catch numbers split across messages.
Rules live in the detection_rules table, editable by the admin, not hard-coded.
Avoid false alarms: peso amounts (₱1,500), times, dates, unit counts and model numbers (for example an aircon model code) must not be flagged. A run of digits is treated as a phone number only if it matches Philippine number patterns.
Photo OCR (reading numbers written in images) is a later, optional phase.
Ship a test file of at least 50 example messages, split into must-catch and must-not-flag, and run it on every build.
Warning shown to both sides (in the chat, as a system message):
For your protection, keep payments and contact inside onService. Our service guarantee, support and dispute help only cover bookings made and paid in the app.
Enforcement ladder (strikes expire after 90 days):
Strike
What happens
Who decides
1
Warning in chat and in-app notice
Automatic
2
Second warning; flag goes to the admin review queue
Automatic, admin reviews
3
Suspended for 7 days
Admin confirms
4
Removed from the platform
Admin confirms
The system never suspends or removes anyone without an admin confirming. The same ladder applies to customers, with "suspended" meaning they cannot post new requests.
Also flag for admin attention: a provider and customer who chat, then cancel, then the customer never books again in that category; and repeat customers of one provider who suddenly stop booking. These are signals, not proof.
Feature 6: Admin panel
The operator gets one web admin panel to see every request, quote, chat, flag and transaction, and to configure, mediate, warn, suspend and refund; every admin action is written to the audit log.
Screen
What the admin sees
What the admin can do
Dashboard
Open requests, average quotes per request, average time to first quote, share of requests with zero quotes, open flags, open disputes
Click through to each list
Job requests
List filtered by status, category, area and date; detail with answers, media, invites, quotes, chats and a timeline
Cancel, re-send invites, invite a provider by hand, add a note
Conversations
Any chat, with flagged messages highlighted
Read (each view is logged), add a note, close a chat
Flags queue
Flags sorted by severity, each message shown with 5 messages before and after
Dismiss, warn, suspend, remove, add a note
Users
Customer and provider profiles, verification documents, strikes, stats
Verify, edit, suspend, reactivate, reset strikes
Bookings and transactions
Agreed price, original quote, price change requests, payments, refunds
Approve or reverse a price change, issue a refund
Disputes
Reason, evidence (chat, photos, media), history
Resolve, set refund amount, notify both sides
Settings
Per-category quote mode, questions, window, invite count, quotes shown, radius, quiet hours; ranking weights; detection rules; warning text
Edit; every change logged with before and after values
Audit log
Every admin action with who, what and when
Search and export
Admin roles:
Owner: everything, including settings and admin accounts.
Moderator: flags, conversations, warnings, suspensions.
Support: view requests, bookings and chats; handle disputes and refunds up to a configurable limit.
Admin login requires two-factor authentication.
Notifications, edge cases and quality requirements
Notifications:
Event
Who is notified
How
New job invite
Provider
Push and in-app
30 minutes left, no response yet
Provider
Push
First quote received
Customer
Push, immediately
More quotes received
Customer
One grouped push, for example "3 quotes ready"
Quoting closed
Customer
Push: "Your quotes are ready"
No quotes after second wave
Customer and admin
Push to customer; admin alert
Quote accepted or not selected
Provider
Push and in-app
New chat message
Recipient
Push
Warning issued
User warned
In-app notice
High-severity flag
Admin
Admin panel alert and email
Edge cases the coder must handle:
Customer cancels while quotes are coming in: invites expire, providers are notified.
Provider cancels after their quote was accepted: booking cancelled, customer offered the other still-valid quotes or a new round, provider gets a strike.
Provider suspended while their quote is open: the quote is hidden and the customer is told.
Customer wants to change the job after quotes arrive: they can add a note visible to all providers; existing quotes are marked "job details updated" and providers may revise.
Double taps and retries never create duplicates (idempotency keys on job requests, quotes and bookings).
Weak or lost signal: uploads resume, and submitting a quote or a booking is safe to retry.
A user cannot quote on their own job.
Quality requirements:
Security: every permission check on the server. A provider can only see jobs they were invited to. Media links expire. Rate limits on posting, quoting and messaging.
Privacy: follow the Philippine Data Privacy Act of 2012 (RA 10173). Get consent at sign-up, publish a retention period for chats and media, and support account data export and deletion requests.
Speed: the quote list loads in under 2 seconds on a typical 4G connection; images load as thumbnails first.
Monitoring: crash and error reporting turned on for the app and the server.
Tests: automated tests for dispatch, the deadline and cap (including simultaneous quotes), detection rules, permissions and the full happy path.
Build phases and audit checklist
Build in 7 phases, each ending with a working APK and a passed audit, so problems are caught while they are small.
Data model and settings: migrations, category settings, detection rules table, admin settings screen. Done when migrations run forward and back cleanly on a copy of the real database.
Job request capture: the customer flow, quick questions, media upload. Done when a request with photos, voice and video posts on a weak connection.
Dispatch and provider quoting: eligibility, ranking, invites, quote form, window, cap, second wave. Done when the cap holds with simultaneous quotes and late quotes are rejected.
Compare and book: quote cards, sorting, tags, accept flow, price change requests. Done when one quote can be accepted end to end and the others are notified.
Chat and off-platform protection: real-time chat, masking, warnings, flags, strike ladder. Done when the 50-message test file passes 100%.
Admin panel: all screens, roles, two-factor login, audit log. Done when every admin action appears in the audit log.
In-app calling: voice, then video, after the calling service is approved.
Audit checklist, run at the end of every phase:
☐ The app builds with zero errors and a debug APK installs and opens on a real Android phone.
☐ Everything that worked before still works: login, fixed-price booking, payments.
☐ Each new screen tested on a small and a large phone, on a slow connection, and with the connection cut mid-action.
☐ Permission test: using a second account, try to open another user's job, media, quote and chat through the server directly. Every attempt is refused.
☐ Deadline and cap enforced by the server, not just the app.
☐ Money stored as whole centavos; no decimal rounding errors; peso amounts display correctly.
☐ Detection test file passes: every must-catch caught, no must-not-flag flagged.
☐ No passwords or API keys in the code or repository.
☐ No crashes or errors in the logs during testing.
☐ All automated tests pass; report how many ran.
☐ The coder re-reads their own changes and lists anything risky, unfinished or assumed.
☐ A fresh AI session, given only this brief and the changes, reviews them and its findings are fixed.
Report each audit as a table: item, pass or fail, evidence (test output, screenshot or log). A phase with any failing item is not done; report what failed and the plan to fix it.
Decisions to confirm before Phase 1:
☐ Which categories use quotes, which keep fixed prices, and which offer both.
☐ Whether customers pay a deposit at booking or pay after the job.
☐ Default window (2 hours), invites (8) and quotes shown (5) are acceptable.
☐ Whether the app needs Filipino or Taglish text alongside English.
☐ Monthly budget for the calling service in Phase 7.
```
