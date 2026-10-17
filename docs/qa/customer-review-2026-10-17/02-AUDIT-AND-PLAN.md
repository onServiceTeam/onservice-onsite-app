# Customer side review (Ken, 2026-10-17): audit, gap analysis, design audit and build plan

For Ken (plain English) and for Claude (who builds next). Ken's words are in 00-KEN-NOTES.md (numbered K1 to K25 below). Ken's storage decision is S1 in 01-KEN-DECISIONS.md. The questions Ken needs to answer are also in `.ai-coder/decisions/D41-customer-review-2026-10-18.md`.

How this was made: 8 read-only audits of the code at master 683e4df8 (the tester server runs 8d319a18, which has no app or API difference for these screens), one synthesis, one critic who re-checked the claims against the code and the tester server, and my own re-checks. Nothing was changed in the code or on the server by the audit. A second audit of the screens this one skipped (the steps after the request form, search, help, support, account and sign-in) is running and will be added as section 8.

Path shorthand: `m/` = apps/mobile/, `api/` = packages/api/src/, `mig/` = packages/api/migrations/. Effort: S = under 2 hours, M = half a day, L = a day, XL = more than a day.

Already decided, so not asked again:
- S1 (Ken, 2026-10-17): storage is not a blocker. Use 20 photos, 2 videos of up to 5 minutes, a 5-minute voice note, large files, common formats. Keep storage behind the upload service so a later move is one place in the code. Make the limits admin-editable. Keep a free-space guard.
- House logo everywhere, no "oS", no orange in brand marks (Ken, 2026-10-14). Say "Service Provider". D38 request-first booking (the first Service Provider to quote wins). E14: payments on hold, wallet only. D40 point 3: Expo's own free modules may be added with a decision file; anything from a new company, a paid service, or sending data somewhere new still needs Ken.

---

## 1. Bad news first

1. **No tester can finish a request-first booking today, and the first wall is "Where", not money.**
   - Not one request-first (D38) request has ever been sent on the tester server: 0 invites, 0 quotes.
   - Testers stop at "Where" (point 4 below) before they reach payment.
   - Behind that is a second wall: every tester wallet is at ₱0.00, top-ups are off (E14), and the wallet is the only way to pay. So the pay step would stop with "Your wallet balance (₱0.00) is below the total" (m/app/customer/booking/pay.tsx:104-106).
   - Fixing the second wall needs Ken: credit tester wallets (D33, still open) or reopen payments (E14 plus PayMongo test keys).
2. **Escrow and refund claims are still on screen in many places, including the pay screen every booking goes through.**
   - The TrustStrip ("Vetted pros · Verified escrow", m/src/components/ui/TrustStrip.tsx:20-25) renders on pay.tsx:271, checkout.tsx:363, confirm.tsx:188, change-order.tsx:238 and payment-methods.tsx:50.
   - More escrow text: pay.tsx:262-266, checkout.tsx:315 and :352, confirm.tsx:73 and :202, complete.tsx:145, help.tsx:47, and the payment-confirmed notice (api/services/i18n.service.ts:44, "held in escrow").
   - "You can wait or cancel for a full refund" in the late-Service-Provider notice (api/jobs/workers.ts:441). It was sent 6 times, once each, on 2026-06-05, about seed bookings.
   - Help says customers "compare quotes ... and accept the best one" (m/app/customer/help.tsx:46-47). That is not D38.
   - The store listing text (m/store-listing/en/metadata.json:4) also claims escrow, GCash and Maya, and lists Carpentry, Painting and Pest Control.
3. **The Google Maps key only draws map tiles inside the Android app.**
   - Nothing turns a pin into a street and barangay, and nothing searches addresses. The address search only matches the 4 service-area city names (m/app/customer/address-picker.tsx:208-238, m/src/utils/ph-regions.ts:1-8).
   - The website has no map at all: a gray "Map preview" box with latitude and longitude boxes (m/src/web-stubs/react-native-maps.tsx:40-57).
   - The website also blocks location completely: the server sends `geolocation=()` in its security headers (repo nginx/nginx.conf:429 too). So "Use current location" can never work on the website, and it fails silently because the pop-up message it uses does nothing on the web (m/src/hooks/useLocation.ts:35-50, :56). This is the likely cause of "nothing works" on desktop.
   - Real address search needs Ken's D24 decision (open since June), new keys and a billing cap. Nobody has checked the Android key's restriction in Google Cloud.
4. **"Where" is blank on every new request, and the picker mostly dead-ends.**
   - Choosing a service wipes the address (m/src/stores/booking.store.ts:151-156, inside setSubcategory) and nothing fills it back.
   - Confirm is gray with no reason when nothing is selected or the barangay is blank (address-picker.tsx:338). It does explain itself in one case, a city with no exact pin (:328-332).
   - 2 of the 3 saved addresses on the tester server have no pin, so the picker refuses them (address-picker.tsx:86-95).
5. **The tab bar and the Save address button really do sit on the phone's buttons.** A fixed 80-point tab bar (m/src/utils/responsive.ts:34) has been there since the first commit. The APK targets Android 16, which forces edge-to-edge, so there is no settings-only fix. At least 7 more bottom buttons have the same problem. Reproduced in a 3-button-phone simulation; not yet checked on a real phone.
6. **Ken's media limits cannot be set in admin today, and the disk guard is weak.**
   - What testers get today: 6 photos; video 30 seconds and 80 MB; voice note 60 seconds and 2 MB.
   - The highest allowed values are hard-coded in three places (mig/184_job_media.sql:87-92, api/services/settings.service.ts:579-584, api/validators/booking.validators.ts:183). A value above them silently falls back to the old default.
   - Hidden code limits would still break 20 photos plus two 5-minute videos (api/config/job-media.config.ts:30-31, :43): 12 uploads in progress at most, 400 MB a day per customer, and about 0.8 MB per second per customer.
   - The tester server's disk is shared with other services and was 84% full. The free-space guard (job-media.config.ts:34) is weaker than it looks. It is checked once, when an upload starts. It ignores the size of that upload and of uploads already running. It is skipped if the free-space check itself fails (api/services/job-media.service.ts:461-465; api/services/upload.service.ts:562-567). It must be made strict before the limits go up.
   - The code's only other storage option is S3 (upload.service.ts:13, :608-621). As far as I know (UNVERIFIED), a Hetzner Storage Box has no S3 interface; Hetzner's S3 product is Object Storage. So the later move is either a mounted disk or a switch to Object Storage. Either way it stays in one place in the code.
7. **On the website, video and voice notes do not work today.** The live security headers block the microphone and stop the browser reading picked videos. The fix is already written and tested in the repo (nginx/nginx.conf:78 and :429, commit ac39a992, test packages/api/__tests__/ha-m2-111-nginx-blocks-job-media-and-allows-microphone.test.ts). The tester server simply has not loaded it, because its web server is shared with other sites and loading a new config affects them for a moment.
8. **"When" cannot hold a chosen day or time.** The screen has only 4 urgency choices (m/app/customer/booking/job-request.tsx:43-48). The API has no date field (booking.validators.ts:222). The database already has `scheduled_at` and `scheduled_window` (mig/183_request_first_response_engine.sql:43, :55-56), and the server sets `scheduled_at` from the urgency choice (api/services/booking.service.ts:2577-2586). Reusing those columns or adding new ones is a design choice in Batch 1b.
9. **Chat has one real wrong-side bug.** On the website, two accounts signed in on the same browser (for example the customer in one tab and the Service Provider in another) share one sign-in (m/src/services/secure-storage.web.ts:13-15). A tab that still shows the customer can then quietly send messages as the Service Provider. Apart from that, the sides are correct, but:
   - the other person's bubble is very faint on white;
   - the header never says "Service Provider";
   - automatic lines never say who acted;
   - support messages look like automatic lines;
   - the quote chat has never run on the tester server (0 quotes ever).
10. **Recurring cannot work under request-first booking, and Projects is unused.**
    - Recurring accepts only fixed-price bookings (api/services/recurring.service.ts:173), and every D38 booking is quote-based.
    - Every customer who finishes a review and tip is sent to a dead-end "This service can't repeat automatically" page (m/app/customer/booking/tip.tsx:109, :342).
    - Projects is a planning notebook with no Service Provider and no money. There are 0 projects on the tester server.
11. **Catalog changes in admin alone will not give Ken his 8 categories.**
    - New empty categories stay hidden on Home (m/src/hooks/useCategoryServiceCounts.ts:51-59).
    - Admin cannot switch a category off (api/validators/admin-catalog.validators.ts:64-69).
    - A simple on/off switch would deadlock: the same "active" flag also hides the category from Service Provider sign-up (api/services/catalog.service.ts:1003-1010), so no Service Provider could ever add TV and it could never be turned on. It needs a separate "show to customers" switch.
    - No Service Provider covers TV or Computer, and only one approved Service Provider covers Appliance.
12. **Phone alerts reach nobody.** There are 0 registered devices and Android has no Firebase project (LAUNCH-LIMITATIONS.md:4243). Yet the notification settings screen says its switches control device alerts (m/src/components/notifications/NotificationPreferencesScreen.tsx:243).
13. **The cleaner look is not a one-file change.** The theme file is shared with about 70 Service Provider files. Each screen hand-codes its own boxy layout. Our own design contract is marked "Locked" and describes today's look (docs/architecture/DESIGN-CONTRACT.md:3). It needs Ken's written OK first.
14. **Customer wallet money can never come out.** Only Service Providers can withdraw (api/routes/wallet.routes.ts:121-122). Closing an account needs a zero balance (m/app/customer/account-management.tsx:331). Refunds land in the wallet. Whether that counts as e-money is an attorney question nobody has asked yet (UNVERIFIED legal point).
15. **"pro" still appears in user-facing text in roughly 80 to 120 places**, including server text such as "Tell the pro about the job" (booking.validators.ts:184-185). Careful: "pro" is also a Service Provider tier value, a route (app/customer/suki-pros.tsx) and a database value. Only visible wording changes.
16. **"Quickly" is relative.** Added up, all the batches below are roughly 17 to 21 working days of build-and-check effort (Batch 1a alone is about 6 to 7). Agents working in parallel shorten the building. Ken's decisions, the APK builds and the phone checks set the pace.

---

## 2. Gap analysis, K1 to K25

| K | What Ken saw | Root cause (file:line) | Fix | Effort | Needs Ken? |
|---|---|---|---|---|---|
| K1 | Too much text under "Book a service" | Hard-coded sentence m/app/(tabs)/home.tsx:310-314 (says "pro"). Test m/__tests__/ha-01-home-page-title.real.test.tsx:44-48 pins it | Delete the sentence; keep the title. Update ha-01 honestly | S | No |
| K2 | Location row opens a typed Edit Address form | The chip opens Addresses (home.tsx:318). The form is 4 typed fields, no map (m/app/customer/addresses.tsx:130-133, :314-357). A pin is optional when saving (addresses.tsx:146-147; api/validators/address.validators.ts:19-20) but booking refuses addresses without one (address-picker.tsx:86-95; booking.validators.ts:216-221) | Batch 1: the chip opens a "Choose address" sheet (saved list plus Add address). Batch 5 (scope addition; Ken said the form "could be okay"): one shared map-first picker | S now; L-XL picker | Batch 5 only (D24) |
| K3 | "Use current location" is inaccurate and not tied to Google | Medium accuracy (m/src/hooks/useLocation.ts:69-71, about 100 m). The reported accuracy is thrown away (:73-76). No check for Android "Approximate" permission (:62-67). No pin-to-street lookup anywhere (D24 open). The form saves the pin and overwrites City/Province with the nearest service area (addresses.tsx:193-194; api/services/service-area.service.ts:498-532). The picker saves "Current Location: lat, lng" as the street (address-picker.tsx:134, :165). Website: location blocked by the security header (section 1, point 3) | Batch 1: high accuracy; 10-15 s timeout with last-known fallback; show the accuracy; warn above about 50 m or on Approximate; never store coordinates as street text; in-page messages on the web. Website needs the header change (Q17). Batch 5: fill street, barangay and city from the pin | S now; M-XL later | D24, Q17 |
| K4 | Save address sits under the phone buttons | Only the top edge is protected (addresses.tsx:214, :274, :421). No bottom space in the footers (:409-415, :453-459). Android 16 forces edge-to-edge | One shared bottom action bar that adds the phone's bottom space. Use it on both Addresses footers and m/app/support/[id].tsx:254, m/src/components/FilterModal.tsx:130-147, m/src/components/booking/DeclineReasonSheet.tsx:92-111, wallet-topup.tsx:29, projects/index.tsx:61, and the Service Provider checklist.tsx:441 and complete.tsx:454 | S (Addresses); M (sweep) | No |
| K5 | Tapping a category lists sub-services | The tile opens the category screen (home.tsx:246-249; m/app/customer/category/[id].tsx:114-134). Same for Quick Re-book (home.tsx:631-637) and the search chips (search.tsx:422, :449). The API already accepts a category-only request (booking.validators.ts:211; booking.service.ts:2571, :2690-2691). Requests already go to Service Providers by category only (api/services/booking/request-eligibility.ts:55-71), so who is notified does not change | With request-first on: the tile sets the category, fills Where, and opens the form. Keep the category screen for the old fixed-price flow. Fix the two places that would show "Service" (home.tsx:644; m/app/customer/booking/tracker.tsx:184). One line: "You agree the price in the app before work starts." New API test: a category-only request through quote, accept and wallet pay. This also drops the per-sub-service intake questions (job-request.tsx:136-150); 0 are configured today | M | Q7 |
| K6 | Photos up to 6; Ken wants 20 | The highest allowed value is 6 (mig/184:87; settings.service.ts:579); 8-item cap (booking.validators.ts:183). Hidden: 12 uploads in progress (job-media.config.ts:30); 400 MB per 24 h (:31) | Migration: highest value and value 20; item cap about 25; in-progress cap about 30; the daily quota and per-request total become admin settings. Resize photos on the phone to 1600 px (expo-image-manipulator is already installed) | M | No (S1) |
| K7 | Video: record or pick, 5 minutes, a second video, big files, more formats | Today: 30 s, 80 MB, one video. Highest allowed: 60 s (mig/184:89; settings.service.ts:581) and 150 MB (:582). One video per request (booking.service.ts:2523). The picker holds one video (m/src/components/job-media/JobMediaPicker.tsx:52, :110). The viewer shows only the first video (m/src/components/job-media/JobMediaGallery.tsx:86, :115). Formats MP4, MOV, 3GP only; .webm from desktop is refused (job-media.config.ts:59-63). Record is hidden on the web (JobMediaPicker.tsx:243). Website blocked by the header (section 1, point 7) | One "Add video" sheet (Record, or Choose from phone). New admin setting "videos per request" (2). Length 300 s. Raise size and quotas only after the guard is strict. The viewer shows every video. Keep the screen awake while uploading (expo-keep-awake is already in the tree). In-app recording at 720p with expo-camera (Expo module, decision file; SDK 55 options UNVERIFIED). Thumbnails from expo-video, which is already installed | XL | Q12, Q13, Q17 |
| K8 | Voice note 60 s; Ken wants 5 minutes | Highest allowed 120 s (mig/184:91; settings.service.ts:583). The 2 MB size cap is smaller than a 5-minute note at the app's 64 kbps (m/src/hooks/useVoiceNoteRecorder.ts:62-67; refused at JobMediaPicker.tsx:126-128 and job-media.service.ts:445). The same setting drives chat voice notes (settings.service.ts:359) | Migration raises the highest value; value 300 s; size 5 MB. Show minutes, not "300 s" (m/src/components/job-media/VoiceNoteRecorder.tsx:72, :76). Keep the screen awake while recording | M | Q14 |
| K9 | "Where" is empty; tapping it "nothing works" | Address wiped by booking.store.ts:151-156; only the picker's Confirm refills it (address-picker.tsx:287). So the form shows "No address selected. Tap to choose." (job-request.tsx:603-606) and Send is blocked (:309). Picker dead ends: city-only search (:208-238); pin-less addresses refused (:86-95); Confirm gray with no reason in most cases (:338); Use My Location off-screen (:485-504, :567); no blue dot and no draggable pin (:547-555). Web map is a stub. A separate cache key (:67-71) is never refreshed by Addresses | Batch 1: fill Where from the default saved address that has a pin (else the first with a pin), with a "Change" link. Show the barangay box from the start. Always say why Confirm is off. Put Use my location first. Blue dot and fixed centre pin. One shared cache key. Batch 5: real search and a web map | M now; XL with Google | Batch 1 no; Batch 5 D24 |
| K10 | No way to choose a day and time | Only 4 urgency choices (job-request.tsx:43-48, :566-585). No date in the API (booking.validators.ts:222). The columns exist (mig/183:43, :55-56). Today only relative hours are added, so time zones do not matter yet; they will once a calendar day is chosen (use Manila time as in api/services/booking/quote-slot.ts:48) | Day strip plus time-window chips (reuse m/src/components/provider/QuoteSlotPicker.tsx:45-60, no new library). Validator. Manila time. Show the day on the Service Provider lead card and pre-select it in their quote. Keep urgency for old APKs | L | Q2, Q3 |
| K11 | Wrong categories; Ken wants 8, visible on Home | Live: Carpentry, "Aircon Services", "Appliance Repair"; no TV or Computer. Four empty categories hidden (useCategoryServiceCounts.ts:51-59). No admin switch-off (admin-catalog.validators.ts:64-69). A rename changes the web address part (catalog.service.ts:213-214) and loses the icon (m/src/config/category-icons.ts:50, :74). TV Repair sits under Appliance and admin cannot move it (admin-catalog.validators.ts:112-124). The grid is 3 columns under 416 dp (home.tsx:140-151) and below the fold | Code: icons (Tv and Laptop exist in lucide 0.456 but are not exported from m/src/components/icons/index.ts:198-210), 'handyman' key, search words (search.tsx:65-92), a "show to customers" switch in admin and API (separate from the active flag), replace the hide-empty rule, grid just below search in 4 compact columns. Data, with Ken's OK, through admin: renames, new rows, order. Bust the catalog cache after | S-M code; M with the switch; minutes of data | Q8-Q11 |
| K12 | "How it works" too wordy | home.tsx:100-122, :535-557. Tests bug-ux-382:41-42, bug-ux-649:31-32, ha-14:53 pin it. Removing it brings back no removed claim | Remove it; update the pinned tests honestly | S | No |
| K13 | Tab bar over the phone's buttons | TAB_BAR_HEIGHT = 80 (responsive.ts:34), used in m/app/(tabs)/_layout.tsx:116 and m/app/(provider-tabs)/_layout.tsx:126. React Navigation keeps a set height and pads the bottom space inside it, leaving about 24 dp for icon and label on a 3-button phone. The Tester Feedback button has the same problem (m/src/components/feedback/TesterFeedbackButton.tsx:62) | About 56-64 plus the bottom space, from one shared hook, in both tab layouts and the Feedback button. Render test with a mocked 48 dp bottom space. Update the fb2-04 test (:179) | S code; M with APK and phone check | No |
| K14 | Bookings pills cut off | Shared m/src/components/FilterChips.tsx: hidden scrollbar (:41), its own 16 padding (:76) and spacer (:64) on top of the screen's 16 (m/app/(tabs)/bookings.tsx:314). It needs about 389 dp; a 360 dp phone has 328. Seen: "Cancell" | New shared equal-width segmented control (pattern in m/app/customer/booking/photos.tsx:467-486). Use it on Bookings, Wallet and the Service Provider Jobs filter | M (shared with K18) | No |
| K15 | Recurring opens an empty screen | Needs a completed fixed-price booking (recurring.service.ts:271-281); refuses quote-based (:173); every D38 booking is quote-based. Tip always goes to make-recurring (tip.tsx:109, :342), a dead end (make-recurring.tsx:204-216). Count bug: status 'completed' (recurring.service.ts:333) does not exist in the bookings status list | Hide the button (bookings.tsx:191-199). Tip goes back to the booking. Keep routes, API, admin page and daily job | S | Q1 |
| K16 | Projects unclear | D27 Phase 5 notebook only (m/app/customer/projects/index.tsx:88-93). No Service Provider can be assigned (api/services/project.service.ts:378-384). Milestone money is escalation E12. Linked at bookings.tsx:200-209 and the desktop menu (m/src/components/WebAppFrame.tsx:89-94) | Hide both entries; keep the code and the admin page | S | Q1 |
| K17 | Messages: who is chatting, which side | The side rule is correct (sender vs signed-in person, m/src/components/chat/ChatThread.tsx:413). Wrong-side case 1: the shared website sign-in (section 1, point 9; m/src/stores/auth.store.ts:147-160, no cross-tab sync). Case 2: a ticket written by admin is drawn as the customer's own message (m/app/support/[id].tsx:219-225). Looks: the other bubble #F1F3FF on white (m/src/components/chat/MessageBubble.tsx:170). Header is a short name only (ChatThread.tsx:394). Automatic lines name nobody (api/services/request-thread.service.ts:150-162; MessageBubble.tsx:110-117). Support messages stored as 'system' (api/services/booking-admin.service.ts:2063-2069). Times without dates (MessageBubble.tsx:114, :147). A red Report under each incoming message (:152-161). Web chat opened at the oldest message in simulation (ChatThread.tsx:297-305) | Header with photo, name and role line ("Service Provider" or "Customer"). Incoming bubble in a neutral gray with a small photo of the sender. Width capped on desktop. Automatic lines say who acted ("You declined the quote"). "onService Support" label. Day separators. Open at the newest message. Stale-tab guard on the web. One render test per fix. Note: no light-gray bubble reaches 3:1 contrast on white (Messenger's does not either); what tells the sides apart is the side of the screen, the photo and the name, and the text itself stays dark | L | Q4 (business name; Report into a menu) |
| K18 | Wallet pills cut off | Same FilterChips (wallet.tsx:278). Seen: "Refunc". The pills sit above the balance card (wallet.tsx:248-257). The amount collides with the text at 360 (wallet.tsx:161) | Segmented control under "Recent transactions" | S after K14 | Q5 |
| K19 | "Top up paused"; unsure why | Not a merchant-account problem. E14: the old code built a PayMongo checkout link PayMongo does not provide, so top-ups got stuck (.ai-coder/escalations/E14-paymongo-hosted-checkout-flow-2026-08-24.md:10-23; 12 June top-ups still stuck on the tester server). The API refuses top-ups (wallet.routes.ts:67). "Top Up Paused" looks like a button but opens an info page (m/app/(tabs)/wallet.tsx:135-142; m/app/customer/wallet-topup.tsx:78-84) | Batch 1: replace the button with one gray line, keeping the tests that guard "no payment control exists". Real fix: E14 Option A (hard stop, needs PayMongo test keys). Interim: credit tester wallets once D33 has limits | S copy | Q27, Q28 |
| K20 | Profile needs review | m/app/(tabs)/profile.tsx: the email is never shown, only the phone (:260). The screen-reader label says "Verified mobile number" (:219), but email sign-ups never verify the phone (api/services/email-code-auth.service.ts:572). Company Workspaces and Team Invitations shown to everyone (:129-132, :150-157). Photo ignored (:195-198). The avatar touches the name. No row for the Notifications inbox. Help describes the old booking flow (help.tsx:37-38, :46-47). The support-hours promise (help.tsx:237) is UNVERIFIED | Header with photo, name, email and Edit. Grouped flat list. Company row only when used; Team Invitations only when an invite is pending (it exists so invites are not link-only, D23 / Bug UX-089). Fix "verified". Add Notifications. Rewrite Help to match D38 | M | Q22, Q23 |
| K21 | Looks like old Facebook; Ken wants Maxim/Messenger | Lavender canvas (m/src/config/theme.ts:40-41, :46). Pale-blue icon tiles #E7EEFF (57 uses). Blue-gray borders #C9CEDD (:38, 145 uses). Navy for everything (:8, :30). Orange tab badge. 49 of 51 customer files have their own styles; no shared header or list row. The theme is shared with about 70 Service Provider files. DESIGN-CONTRACT.md is "Locked", and it, docs/design-system/tokens.json and the Stitch DESIGN.md disagree. Inter is never loaded | Decision, then tokens, shared components (ScreenHeader, ListRow, SegmentedControl, BottomActionBar), then the screens (section 3) | XL (3-4 days) | Q18-Q21 |
| K22 | Addresses screen | K2-K4, plus: the default tick is invisible (blue on blue, addresses.tsx:403 on :654); editing any text erases the pin (:66-71); location errors are silent on the web (useLocation.ts:35, :56, :78); an em dash in the delete dialog (:468) | Batch 1: bottom space, tick colour, keep the pin when text changes, in-page messages on the web. Batch 5: map picker; ask owners of pin-less addresses to set a pin | S each; L-XL map | Map only (D24) |
| K23 | Payment methods "look like a toy" | payment-methods.tsx: GCash and Maya share a generic phone icon (:17-23); four yellow "Paused" pills; rows look tappable but only show a toast (:29-36); TrustStrip (:50); engineering text (:87-95) and an escrow box (:97-105); "← Back" text and a fixed 48 px top (:42, :119). No logo files in the repo. The list is copied 3 times (payment-methods.tsx:17-23, booking/checkout.tsx:35-39, booking/pay.tsx:49-55) | One white row, "onService Wallet" with the real balance, that opens Wallet, plus one gray line. No brand names, pills or escrow text. One shared method list. Real logos only after E14, from official files | M | Q26 |
| K24 | Notifications look like a prototype | Bordered cards with icon tiles (m/app/customer/notifications.tsx:244-264). The unread tint hides the icon (:254 vs :261). No date groups (:186-219). Party-popper and gift icons (:49-54, :79). D38 types fall back to a bell (:45-80). Titles mix case, say "Provider", and never name the service or time (i18n.service.ts:40-57). Settings claim device alerts that reach nobody | Flat rows grouped Today / Yesterday / Earlier. Unread = dot plus bold. Plain icons. Gear to settings. Real sentences. Honest settings text. Reword the late-Service-Provider notice (no data change needed: it sends at most once per booking, workers.ts:421-429). Tagalog too | M app + M API | Q24, Q25 |
| K25 | Audit everything, customer first | Root pattern: no shared header, row or segment components; locked design docs that disagree; "pro" wording | This document; Batches 0 to 5; section 8 adds the screens this audit skipped | n/a | Q30 |

---

## 3. Design audit

### Screen by screen

**Home.** Reads as old Facebook or a prototype:
- 4 stacked text lines before anything you can tap (home.tsx:284-314).
- A lavender header bar (:728, :738).
- Every element is a white box with a blue-gray outline: tiles (:874-886), search (:852-863), booking card (:807-814), How it works (:1085-1094).
- "See all >" typed as text (:378, :565). Orange tab badge.
- Up to 3 booking cards push the categories below the fold (:363-415).

Target (Maxim-like): white page with greeting, "Book a service", the address chip and a gray search pill. Then 8 category icons in a 4-column grid (brand-blue icon on a light gray circle, no tile borders). Then one compact active-booking card. No How it works.

**Request form.** Reads as a prototype:
- A helper sentence on every card, several saying "pro" (job-request.tsx:443, :473, :493, :516, :590, :618).
- "When" is 4 radio buttons; "Where" is a dead text row.
- The video row has no thumbnail (JobMediaPicker.tsx:221-230).

Target: short section labels. Describe the job (large text box); Photos and videos (thumbnail strip with a + tile and "3 of 20"); Voice note (record button with a minutes timer); Budget; When (day strip plus window chips); Where (prefilled address with Change). A sticky "Send request" bar above the phone's buttons.

**Address picker ("Where").** Reads as a developer tool: a form squeezed into a 330 px panel (address-picker.tsx:567) with a gray dead button. On the web, a gray "Map preview" box with latitude and longitude boxes (:506-542); Longitude spills out of its card at 360.

Target (Grab/Maxim): a full-screen map with a fixed centre pin, search on top, a "Use my location" button on the map, and a bottom sheet with the found address, a unit/landmark field and one Confirm above the phone's buttons.

**Bookings.** Reads as old Facebook: cut-off pills; Recurring and Projects buttons stacking the header (bookings.tsx:171-209); a typed "›" (:162); bordered cards (:339); "Waiting for a pro" (:43-46).

Target: large title "Bookings", segmented All / Active / Completed / Cancelled, flat rows (service icon, service, Service Provider, date, status pill, chevron).

**Messages and chat.** Reads as old Facebook:
- Inbox rows are bordered cards (m/src/components/chat/ConversationList.tsx:138-148) with a coloured initial that ignores the photo (:91-95).
- A two-sentence subtitle (m/app/(tabs)/messages.tsx:22).
- In chat: faint incoming bubbles, a red Report under each, a permanent tinted strip (ChatThread.tsx:402-404, :477-485), a tinted header, no dates.

Target (Messenger): white page with a large "Messages" title. Flat rows with round photos; bold name and a blue dot only when unread. Chat header: photo, name, and "Service Provider · Aircon · Cebu City". Your messages blue on the right; theirs gray with a small photo. Day separators. A "..." menu.

**Wallet.** Reads as old Facebook: a solid navy balance slab (wallet.tsx:283-289) with a white "Top Up Paused" pseudo-button (:297-304); lavender page and pale-blue icon tiles (:333-341); pills above the card; rows that cannot be tapped and show raw server text such as "Change order additional payment" (booking.service.ts:3173).

Target: a white card with a small "Balance" label and a large dark amount; one gray line about adding money; "Recent transactions" with the segmented filter; rows showing service, booking reference, date and signed amount, each opening its booking.

**Profile.** Reads as old Facebook: initials instead of the photo, the avatar touching the name, nine Title Case rows with blue icon squares inside one bordered box (profile.tsx:127-165, :406-441). Company and Team rows for everyone.

Target: a header with round photo, name, email and Edit; grouped flat lists (Account / Activity / Support) with gray icons; Log out as a plain red text row; a small version line.

**Addresses.** Reads as a prototype: each card carries three text buttons (addresses.tsx:229-270); "You've reached the end" under two items; four typed fields; an invisible tick; Save under the phone's buttons.

Target: rows with label, address, a Default tag and a chevron. Delete inside Edit. "Add address" opens the map picker (Batch 5).

**Payment methods.** Reads as a toy: "← Back" as text; the TrustStrip; five rows with generic icons and four yellow Paused pills; two stacked boxes of engineering text.

Target while payments are on hold: one wallet row with the real balance and one gray line. After E14: a plain radio list of server-confirmed methods with official logos.

**Notifications.** Reads as a prototype: bordered cards, tinted unread cards that hide their icons, party poppers, no date groups, mixed-case titles saying "Provider".

Target: flat white rows grouped Today / Yesterday / Earlier; dot plus bold for unread; a gray icon or the Service Provider's photo; real sentences ("Juan D. is on the way. Aircon cleaning, today 2:00 PM."); a gear icon to settings.

**Desktop web frame.** Reads as old Facebook: a tinted left-menu row with a navy bar (WebAppFrame.tsx:441-454), a square navy avatar (:466-473), a navy backdrop (:369). The "oS" mark is being replaced by the logo job.

Target: white, a neutral active row, a round avatar.

### Proposed design direction (one page)

**Principles.** White page. One action blue, used only for things you tap or that are selected. Neutral grays, not blue-grays. Lists, not boxes. At most three text sizes per screen. Sentence case. Plain icons. The house logo is unchanged.

**Colour tokens.** Most values already exist in docs/design-system/tokens.json:19-22, :39-59.

| Token | Value | Use |
|---|---|---|
| canvas | #FFFFFF | Every screen background (replaces #FAF9FF / #F1F3FF, theme.ts:40-41, :46) |
| wash | #F4F4F4 | Search pill, segment track, skeletons, quiet grouped areas |
| separator | #E0E0E0 | Hairlines, inset to where the text starts |
| input border | #8D8D8D | Form fields (3.3:1; today 1.57:1) |
| text / secondary / tertiary | #161616 / #525252 / #6F6F6F | Replaces navy #051A3E and the blue-grays |
| brand | #003D9B | Logo and wordmark only |
| action | #0052CC | Buttons, links, active tab, selected segment, your chat bubble, unread dot |
| action soft | #E7EEFF | Selected row only; never decoration behind icons |
| incoming bubble | a neutral light gray (about #E9E9EB) | Always with the sender's photo; dark text |
| count badge | #B42318 with white text | Replaces orange (needs Q21) |
| status pairs | success #006844 on #DEFBE6; warning #8A4B00 on #FCF4D6; danger #B42318 on #FFF1F1; info #0043CE on #EDF5FF | Also fixes the failing warning toast (Toast.tsx:54, 3.73:1) |

**Type.** The phone's own font (Q20). Weights 400 to 700 only. Large title 28/34 700 (tab roots). Title 20/26 600. Headline 17/22 600 (row titles, names). Body 16/22 400. Subhead 14/20. Footnote 13/18 (times, hints). Caption 12/16 500 (badges, tab labels). Amount 32/38 700.

**Shapes.** Radius 12 for buttons, inputs and cards. Full radius for pills and search. 16 on sheet tops. Round avatars.

**Shared components (built once, then every screen uses them).**
- ScreenHeader: white, 56 plus the top safe area, chevron back, 17/600 title, hairline below; a large-title variant for tab screens.
- ListRow: a 24 px gray icon or a 40-56 px photo, a 17/600 title, a gray second line, a chevron or value on the right, inset hairline, at least 56 tall (72 with a photo).
- Card: only for one live object with actions (active booking, quote, request status). At most 2 per screen. 1 px #E0E0E0 border, no shadow.
- SegmentedControl: 4 or fewer options, equal width, always fits.
- BottomActionBar: always clears the phone's buttons.
- Tab bar: white, hairline top, 56 plus the bottom space, 24 px icons, 12/500 labels, action blue when active, #6F6F6F when not.
- EmptyState: icon, one line, one sentence, one button.
- Status pill: sentence case.

**Icons.** lucide through @/components/icons (DESIGN-CONTRACT.md:67). Gray by default. Plain icons instead of PartyPopper and Gift. Roofing's House icon looks like a second logo (category-icons.ts:56, :78); moot if Roofing is hidden.

**Guardrails.** Do not recolour the logo. No orange anywhere in customer UI once Q21 is answered. The theme is shared, so the Service Provider app shifts too (Q21).

---

## 4. Build plan, customer side

Every batch ships the same way:
1. Mobile jest render suite (not just tsc); any new React Native API added to m/__mocks__/react-native.js.
2. API tests for any API change.
3. Push to master, watch the 5 gates without idling.
4. Deploy API and web to the tester server with the release helpers (docs/runbooks/tester-server-release.md). The web server is shared, so no restarts without Ken.
5. Bust the catalog cache after any catalog data change.
6. New APK with a versionCode bump.
7. Check on one 3-button phone and one gesture phone.

Finish and re-check each batch before starting the next.

**Batch 0. The house-logo job (running now; APK versionCode 7).**
- Its uncommitted changes touch the same files as Batches 1 and 3 (home.tsx, WebAppFrame.tsx, app.config.ts, app/index.tsx, onboarding.tsx, the sign-in brand panel, a new BrandMark component, admin files and icons). It lands first so later batches do not conflict.
- It changes the app icon and splash, so it needs its own APK.

**Batch 1a. Quick wins, app plus small API text changes (APK versionCode 8).** Starts as soon as Batch 0 lands. Needs no Ken answer:
- K13: tab bar height from one safe-area hook, both tab layouts and the Feedback button.
- K4: shared BottomActionBar on both Addresses footers and the 7 other bottom buttons listed under K4.
- K14 and K18: SegmentedControl on Bookings, Wallet (moved under "Recent transactions") and Service Provider Jobs.
- K1 and K12: remove the Home subtitle and How it works; shorten the chat strip, the Messages subtitle and the request-form hints.
- "Service Provider" wording in customer, shared and server text (never tier values, routes or database values). Tests that pin wording updated honestly.
- K9: fill "Where", picker quick fixes, one shared cache key.
- K3: location quick wins (app side).
- K22: tick colour, keep the pin when text is edited, in-page messages on the web, the em dash.
- K17: role line in the chat header (the API adds the role and display name to the other-person data), incoming bubble, actor-named automatic lines, support label, day separators, open at newest, stale-tab guard on the web.
- K19: replace "Top Up Paused" with one gray line.
- Help: rewrite "compare quotes ... accept the best one" to match D38.

Added to Batch 1a only after Ken answers:
- Q6: remove the escrow and "full refund" claims everywhere listed in section 1, point 2 (including the pay screen).
- Q1: hide Recurring and Projects; Tip goes back to the booking.
- Q4: business name in the chat header; Report into a "..." menu.
- Q5: drop the Top-ups wallet filter.

**Batch 1b. "When" with a day and time (API plus migration; can ship a day after 1a).** Waits on Q2 and Q3. Validator, Manila-time calculation, Service Provider lead card, quote pre-select, request status, booking page and admin.

**Batch 2. Request form, media and catalog (APK versionCode 9).**
- 2a, catalog and form:
  - K5: category goes straight to the form when request-first is on, including Quick Re-book and the search chips, the two "Service" fallbacks, the price line, and the new category-only API test (Q7).
  - K11 code: icons, the 'handyman' key, search words, the "show to customers" switch in API and admin with tests, the hide-empty rule replaced, the grid moved up. Then, with Ken's OK, the catalog data changes through admin and a cache bust (Q8-Q11).
- 2a, media server side, in this order:
  1. Make the free-space guard strict: count this upload's size and the uploads already running, and refuse when the check fails.
  2. Migration raises the highest allowed values. New admin settings: videos per request (2), uploads in progress, daily bytes per customer, upload-speed cap, per-request total; chat voice length kept separate (Q14). Admin shows MB, not raw bytes (apps/admin/src/pages/SystemSettingsPage.tsx:448-453).
  3. Ship the server with today's values first; switch Ken's values on after the new APK is out. Length, size and quotas move together. Otherwise APK 1.0.5 would let a customer record 5 minutes and then refuse the file (m/src/utils/picked-media.ts:83-86).
- 2a, media app side: multi-video picker; the viewer shows every video; photos resized to 1600 px; minutes wording; one "Add video" sheet; keep-awake.
- 2b: in-app 720p recording (expo-camera, decision file) and thumbnails from expo-video. Website: load the already-written web-server config plus `geolocation=(self)` in a window Ken picks (Q17).

**Batch 3. Theme refresh (APK versionCode 10).** Needs Q18-Q21.
1. Decision record, then update tokens.json and DESIGN-CONTRACT.md (locked, so Ken's OK).
2. Show Ken a 3-screen mock (Home, Messages, Profile) on the local web stack before migrating everything.
3. Tokens in theme.ts; restyle the shared components (Button, Card, Input, StatusBadge, Toast, Avatar, EmptyState, Skeleton, the chat set, both tab bars, WebAppFrame); ScreenHeader and ListRow.
4. Migrate screens: Home, request form, Bookings, Messages and chat, Wallet, Profile, Addresses, Payment methods, Notifications, then the screens in section 8.
5. Quick sweep of the Service Provider screens, which shift with the tokens.
6. Only then capture the F#3 phone screenshot baselines; capturing them earlier means redoing them.

**Batch 4. Payment methods, notifications, profile, wallet polish (APK versionCode 11).**
- K23: wallet-only Payment Methods; one shared method list for Payment methods, checkout and pay (Q26).
- K18/K19: tappable wallet rows with service name and booking reference.
- K24 app: list redesign, date groups, D38 type icons, the gear, honest settings text, a time picker for quiet hours. K24 server: real titles, Tagalog (Q25).
- K20: profile regroup, email, photo, the "verified" fix, Company/Team only when used, a Notifications row, Help rewritten to D38 (Q22, Q23).

**Batch 5. Real Google address search and map (only if Ken says yes to Q16).**
- Server endpoints for Places autocomplete (Philippines only), place details and pin-to-address lookup, sign-in required, per-person limits, caching.
- Keys: a new server key restricted to the server; the existing Android key restricted to the app and Maps SDK for Android only (Ken's console check); a website map key restricted to app.onservice.ph, plus Google in the website security headers.
- One shared map-first picker for Addresses and "Where". New saves need a pin; owners of pin-less addresses are asked to set one.
- Privacy notice and data inventory updated for sending pins to Google (attorney wording).

**Later, Service Provider side (found during this audit):**
- Category-only Service Providers see an empty "My services" list (api/services/provider.service.ts:191).
- Service Provider sign-up offers categories customers cannot book (m/app/provider-onboarding/categories.tsx:30-34).
- The checklist and complete-screen bottom buttons (in the K4 sweep).

---

## 5. Questions for Ken (my recommendation in bold)

Batch 1:
- **Q1.** Hide the Recurring and Projects buttons for now? **Yes.** Recurring cannot work with quoted jobs; Projects is a notebook nobody uses. The code stays.
- **Q2.** "When": a day plus a time window (morning, afternoon, evening, or as soon as possible), or an exact clock time? **Day plus window.** It matches how Service Providers already quote.
- **Q3.** Is that day a wish the Service Provider can counter in the quote, or a must? **A wish.** The customer sees any other time before accepting.
- **Q4.** In chat, show the Service Provider's business name with the person's name under it, and move "Report" into a small "..." menu? **Yes to both.**
- **Q5.** Drop the "Top-ups" wallet filter while top-ups are off? **Yes.**
- **Q6.** May I remove "Verified escrow", the escrow text and "held in escrow" everywhere (including the pay screen), and change "cancel for a full refund" to "you can wait or cancel the booking" until the policy is checked? **Yes.** It removes claims; it adds none.

Batch 2:
- **Q7.** Category tap goes straight to the form with no job-type list, plus one line "You agree the price in the app before work starts"? **Yes.** The per-job price guide and the per-job intake questions (none configured today) go with the list.
- **Q8.** Categories, in this order: Cleaning, Plumbing, Electrical, Aircon, Handyman, Appliance, TV, Computer service? **Yes.** Renaming Carpentry and "Appliance Repair" changes their web addresses (no links use them today); APK 1.0.5 shows a plain icon for Handyman until the new APK.
- **Q9.** TV as its own category, or a tile that opens Appliance? **Its own category.** Today no Service Provider lists TV Repair at all, so someone has to sign up for it either way.
- **Q10.** Show TV and Computer before any Service Provider covers them? **No.** Add them with a new "show to customers" switch left off, so Service Providers can sign up for them first. Turn each on when at least one approved Service Provider covers it.
- **Q11.** Hide Painting, Pest Control, Roofing and Landscaping from customers on the tester server? **Yes,** through the new switch, not a direct database edit.
- **Q12.** Phone-gallery videos are not compressed on Android. Which approach? (a) a size cap with a clear "trim it" message, plus in-app recording at 720p; (b) a third-party compressor (new company, hard stop); (c) server conversion (heavy on a shared server). **(a)**, with 500 MB per video as the default, editable in admin, and only after the disk guard is made strict. A 5-minute in-app 720p recording is roughly 150-250 MB.
- **Q13.** Formats: phones record MP4, MOV and 3GP; desktop browsers often make .webm. Accept .webm too? **Yes,** with a clear message for anything else.
- **Q14.** Chat voice notes: keep them at 60 seconds with their own setting? **Yes.**
- **Q15.** The disk guard stops onService uploads at 5 GB free, on a disk shared with other services. Raise it to 10 GB until storage moves? **Yes.**
- **Q16.** (D24, gates Batch 5) Use Google address search and pin lookup through our server, Philippines only, with a daily cap and a budget alert? **Yes.** It needs new keys, Ken's check of the Android key in Google Cloud, and an attorney line in the privacy notice.
- **Q17.** When may I load the new web-server settings so video, voice and "use my location" work on the website? The video/voice part is already written and tested; location needs one more line. The web server is shared with other sites, so loading it affects them for a moment. **A quiet time Ken picks, tested first, with Ken watching.**

Batch 3:
- **Q18.** Approve the new look (white pages, neutral grays, one action blue, flat lists) and unlock the design contract to say so? **Yes, after seeing a 3-screen mock.**
- **Q19.** Blue #0052CC (already in our tokens) for buttons and links, with the logo staying #003D9B? **Yes.**
- **Q20.** Font: the phone's own, or bundle Inter? **The phone's own.** No add-on, and it feels native like Messenger.
- **Q21.** Let the Service Provider app change colour at the same time (the theme is shared)? Switch the tab badge from orange to red? Retire the TrustStrip? **Yes to all.**

Batch 4:
- **Q22.** Is "support Monday to Saturday, 8 AM to 6 PM" true today? **Remove it until it is staffed.**
- **Q23.** Show Company Workspaces only to people who have one, and Team Invitations only when an invite is waiting? **Yes.**
- **Q24.** Set up Firebase for Android phone alerts now or later? **Later.** Until then, settings say "alerts show in the app".
- **Q25.** Who checks the Tagalog notification text?
- **Q26.** Payment Methods while payments are held: show only the wallet, with no brand names or logos? **Yes.** Official logos later, from PayMongo or the brand owners, once E14 lifts.

Money and legal (these do not block the screens):
- **Q27.** Credit tester wallets so testers can finish a booking? **Yes,** a small fixed amount to tester accounts only, after D33 adds a maximum and a preview.
- **Q28.** E14: choose Option A (PayMongo Checkout Sessions), get PayMongo test keys, and confirm which methods are switched on for the merchant account? **Option A.**
- **Q29.** Ask the attorney whether a customer wallet balance that cannot be withdrawn, and that blocks account closure, is a problem (e-money), and how long job photos and videos may be kept? **Yes, both in one request.**
- **Q30.** Approve this batch order (0, 1a, 1b, 2, 3, 4, then 5 if Q16 is yes)? **Yes.**
- **Q31.** The store listing text claims escrow, GCash and Maya and lists old categories. Rewrite it with Batch 2? **Yes,** with the same wording rules as Q6.

---

## 6. Corrections made to the first draft (by the critic and by me)

- The first wall for testers is "Where", not the wallet (no D38 request has ever been sent).
- Escrow claims were undercounted: the TrustStrip and escrow text are also on the pay, checkout, confirm, change-order and complete screens and in Help.
- The website blocks location entirely (`geolocation=()`), which the first draft missed.
- The video/voice web-server fix is already written and tested; it only needs loading.
- `scheduled_at` and `scheduled_window` already exist in the database.
- The disk guard is weaker than first described, so it gets fixed before any limit goes up, and the video default is 500 MB, not 1 GB.
- A category on/off switch would have hidden TV from Service Provider sign-up too; it is now a separate "show to customers" switch.
- No Service Provider lists TV Repair today.
- The no-show notices need a wording fix only; no data change.
- The proposed incoming bubble colour does not fix contrast by itself; the side, photo and name do the work.
- "Confirm stays gray with no reason" is true except in one case.
- Today's real limits are 30 s / 80 MB video and 60 s / 2 MB voice, not the higher ceilings.
- Batch 0 needs its own APK, so later APK numbers move up by one.
- expo-video already makes thumbnails and expo-keep-awake is already in the tree, so no new module is needed for those.
- The Batch 1a estimate was about half of its own parts; the honest totals are in section 1, point 16.
- The address map picker is a scope addition (Ken said the form "could be okay").
- Citation fixes: the 8-item cap is booking.validators.ts:183; surfaceMuted is theme.ts:46; "Verified mobile number" is the screen-reader label (the visible label is "Mobile Number"); edge-to-edge comes from the Android build settings and targetSdk 36.
- LAUNCH-LIMITATIONS.md:1730 points to a wrong E14 file name; a correction note will be added there (not a silent rewrite).

## 7. Not verified yet

- Real-phone behaviour: the nav-bar overlap was simulated, not seen on a device. Also unchecked: the keyboard over the address Save button, chat scrolling on a phone, a 5-minute recording when the screen locks.
- Whether the Android map tiles render on Ken's phone, and the Android key's real restriction.
- Whether Android's built-in pin-to-address lookup returns barangays.
- A category-only request all the way to payment (no test covers it; reading the code says it works).
- That APK 1.0.5 matches master.
- The pill widths (estimated from browser font measurement).
- The expo-camera recording options on SDK 55.
- Whether Ken's desktop chat confusion was the two-tab case.
- Every legal point: escrow wording, stored value as e-money, logo licensing, support hours, the "full refund" promise.
- Whether Suki and referral wallet credits are switched on.
- Hetzner Storage Box access methods.

## 8. Screens the first audit skipped

Running now (read-only): the steps after the request form (request status, quotes, confirm quote, pay, booking page, tracker, payment failed), the end of a job (complete, review, tip, change order, disputes) and whether the old fixed-price screens are still reachable, search, category page, Service Provider profile, Suki, referral, Help, safety and support, sign-in and first run, account management, data rights, notification settings, and the desktop web frame. Results will be added here.
