# Tester feedback: audit of the current system, and the plan for version 2

October 12, 2026. Written by Claude Code at Ken's request: "fully audit and fix the /feedback site ... as if it were totally wrong ... A to Z."

## Bad news first

1. **New testers cannot sign in.**
   - The feedback page says "No login. No password. Just click a link below", but demo auto-login has been off since June, so the links stop at a normal sign-in screen.
   - SMS codes are paused (D37), and email codes are not switched on yet.
   - The tester code works only for phone numbers on the server's allowlist (`DEV_OTP_ALLOWED_PHONES`).
   - So a person who installs the APK today cannot get in unless their number is added, or they are given a test account.
2. **Tester screenshots are publicly reachable on the live server.**
   - Anyone with a screenshot's web address can open it.
   - The fix (an nginx rule) is in the code but was never applied on live, because applying it needs the shared nginx container recreated (E52, LAUNCH-LIMITATIONS 60).
3. **The questionnaire is too long and repeats itself, so it produces tired, polite, guessed answers.**
   - It has 76 text questions, 37 ratings and 12 price boxes, plus the problem log at the very end.
   - "Confusing words" is asked 6 times, "one feature you want" 5 times, and pricing in 7 places.
   - Several questions ask about things testers cannot do in a test build: paying, cashing out, signing, refunds. Those answers are guesses.
   - Several ratings are double questions, so a low score cannot tell us which half failed.
   - Some ratings state money claims as facts ("Knowing my payment is held safely ...").
4. **The admin queue mislabels most submissions.** The one-line summary is the first answer longer than 3 letters, which is usually the "How often do you book home help?" answer ("Monthly"). Search therefore cannot find what testers actually wrote.
5. **Answers and screenshots can be lost.**
   - The page has no autosave.
   - The app links open in new tabs, and phones often drop the background tab.
   - Screenshots still uploading when Submit is pressed are silently dropped.
   - A failed upload explains itself only in a tooltip, which a phone cannot show.
6. **The analysis side is manual and thin.**
   - The spreadsheet export has no answers, ratings, prices or problems in it.
   - There is no completion rate, ease score, usability score or theme count anywhere.
   - "AI review" is a document telling the AI coder to read an inbox.
   - The usability score that the triage guide relies on is not asked on the web page at all.

The full audit (every file, every question verbatim, 26 defects with file and line) is in the session record and summarised in section 5 below.

## 1. What the research says (and what we will do about it)

| Finding | What v2 does |
|---|---|
| People are polite to whoever made the product ("courtesy bias"). It is strongest face to face, and in cultures that value harmony. *Hiya* and *pakikisama* are the Filipino forms of this. Anonymity, written channels and behaviour-based questions reduce it. | Say plainly "we are testing the app, not you". Name and contact are optional. Answers go into a private form, not to Ken in chat. Questions ask what happened, not whether they liked it. Every task asks "what would you change here?", so criticism is the normal answer, not a rude one. |
| Unmoderated tests work when participants get **realistic goals**, not instructions, written without the app's own button words. Otherwise people hunt for the word. | Testing is organised as 6 to 8 short **missions** per role ("Your aircon is dripping. Find someone to clean it this Saturday and see what it will cost.") instead of "test each area". |
| **No leading questions.** "Was it easy?" pushes a yes. Use the Single Ease Question (SEQ, 1 to 7, "Very difficult" to "Very easy", only the ends labelled) right after each task, then "Why?". | Every mission ends with: did you manage it (yes / partly / no / gave up), the SEQ, "Why that score?", and "What did you expect to happen that didn't?". |
| A useful problem report has **what you were trying to do, what happened, what you expected**, plus where and how bad. | The "Report a problem" form has exactly those fields: a picker of real screen names, a 4-step "how bad" in plain words, and screenshots (pick, paste or drag). It is reachable from every page, and from inside the app. |
| **SUS** (System Usability Scale, 10 standard statements, 1 to 5) belongs once at the end. It gives a 0 to 100 score we can compare across app versions. | Asked once at the end, with the standard wording, plain English and alternating tone, and scored automatically. |
| A tester's own severity rating is a weak signal. Frequency across testers matters more. Real problems show up in the first 5 testers. | The analysis counts how many different testers hit each problem, ranks by severity × frequency, and treats the tester's own "how bad" as one input. |
| Pilot the study before sending it widely. | Version 2 is first sent to 2 or 3 testers, fixed, then to everyone. Every answer stores the study version it was asked under. |

Sources:
- IxDF, "How to get more honest feedback in user testing": https://ixdf.org/literature/article/how-to-get-more-honest-feedback-in-user-testing
- CleverX on honest feedback: https://cleverx.com/blog/how-to-get-honest-feedback-in-usability-testing-without-misleading-results/
- Maze, usability test questions: https://maze.co/guides/usability-testing/questions
- Userbrain, test scenarios: https://userbrain.com/blog/5-tips-user-test-scenarios
- GitLab UX research script guide: https://handbook.gitlab.com/handbook/product/ux/experience-research/writing-usability-testing-script/
- Trymata on the Single Ease Question: https://trymata.com/blog/measuring-task-usability-the-single-ease-question/
- Koji on courtesy bias: https://www.koji.so/docs/courtesy-bias
- MeasuringU on rating severity: https://measuringu.com/rating-severity/
- Feedback in the Philippine workplace (hiya, pakikisama): https://onecoredevit.com/news-and-insights/human-resources/feedback-in-the-philippine-workplace-a-guide-for-team-success/

## 2. Version 2: what the tester experiences

All on **app.onservice.ph/feedback**, designed for a phone first. It works in the phone's browser next to the APK, and on a computer.

1. **Welcome (one screen).**
   - What onService is, and why we need them: "Find what's wrong before real customers do."
   - "We are testing the app, not you. If you get stuck, that's our mistake, and it's the most useful thing you can tell us."
   - About 40 minutes, which can be split over several sittings; progress is saved.
   - Answer in English, Tagalog, Bisaya or Taglish.
   - What we keep and for how long (privacy notice), and a tick box to agree.
2. **About you (30 seconds).**
   - Which side they are testing: customer, provider, or both.
   - Phone or computer, app or browser (detected for them, and they can correct it).
   - How they get home help today (Facebook groups, a neighbour's referral, a company, and so on).
   - Name and contact are optional.
3. **First impression (before tapping anything).** "Open the app and look at the first screen for 10 seconds. What do you think this app is for? Who is it for? What would you tap first?"
4. **Missions.** One card per mission, done in any order, each saved as soon as it is finished. Each card asks:
   - **The goal**, in everyday words.
   - **What to stop at:** "Stop when you reach the payment screen. Nothing is charged in this test."
   - **Did you manage it?** Yes / Partly / No / I gave up.
   - **How difficult or easy was it?** 1 to 7.
   - **Why that score?**
   - **What did you expect to happen that didn't?**
   - **One thing you would change on these screens.**
   - **Screenshots** (optional): pick, paste or drag.
5. **Report a problem (any time).** A button that is always on screen, and also a link inside the app. It asks:
   - What were you trying to do?
   - What happened?
   - What did you expect?
   - Which screen? (a picker; "inside the app" fills it in automatically)
   - How bad was it? "It stopped me" / "It slowed me down" / "It annoyed me" / "It just looks wrong"
   - Screenshots.

   Every report is saved the moment it is sent.
6. **Wrap-up.**
   - The 10 SUS statements.
   - "Name the 3 things you would change first." (Three boxes. Every app has three.)
   - "What would you remove or make simpler?"
   - "Was any word or button name unclear? What would you call it?"
   - "Would you use this instead of how you get help today? Why or why not?"
   - "What would you need to see before letting a worker from this app into your home?" (customers) or "before relying on it for income?" (providers).
   - Fair price, for two services only, with the four standard price questions, checked so the numbers go up in order.
   - "Anything else?"
7. **Thank you.** It shows how many missions and reports they sent, and how to come back and add more.

What is cut: the admin-console questionnaire (the admin is for staff; it gets its own staff walkthrough later), NPS (meaningless on sample data), the 6 repeated "confusing words" questions (now 1), and every question about things a tester cannot do in the test build.

## 3. Version 2: what we get out of it (the analysis)

- **Database:**
  - A tester session table, plus one row per answer, per mission and per problem.
  - Each row records the study version, role, device, app version and screen.
  - The old table and its rows stay as they are, for history.
- **Admin "Tester feedback" page, rebuilt:**
  - **Overview:**
    - testers so far;
    - each mission's completion rate and average ease score, with counts;
    - the overall usability score;
    - problems grouped by screen, with how many different testers hit each one and how bad.
  - **Problems list:** filter by screen, side and severity, with screenshots shown next to their own report. Merge duplicates into one problem. Triage stays as today: status, owner, note, history.
  - **Each tester's full session, in order.**
- **Export bundle** (private, key-protected, pulled to Ken's machine): one spreadsheet per question type (missions, problems, wrap-up, SUS), every screenshot, and a summary page.
- **Analysis protocol for the AI coder,** written like a market-research coding manual:
  - code every open answer into themes using a fixed codebook;
  - count themes per role;
  - read every screenshot and describe what it shows;
  - merge duplicate problems;
  - rank by severity × number of testers;
  - quote testers word for word;
  - turn the top items into repair tasks with the tester evidence attached.

  The result is a dated insights report in the repo.
- **Optional later (your decision):** run the theme coding and screenshot reading automatically on the server with the Claude API. That needs an API key and a monthly budget, so it is not built until you say so.

## 4. Privacy and safety fixes in v2

- **Screenshots become private on live** without recreating the shared nginx: the API stores them where the web server cannot read them. This is checked on the server before and after.
- **Location data is removed from photos** (EXIF and GPS) when uploaded.
- **Uploads that were never sent** are cleaned up after 24 hours, and there is a per-tester upload cap.
- The stored IP comes from the trusted proxy, not from a value the browser can fake.
- A plain privacy notice on the welcome screen.
- **Retention:**
  - raw screenshots and contact details deleted after **180 days**;
  - answers kept without contact details.

  This is a proposal; Ken's decision, because data retention (E21) is a DPO/attorney item.

## 5. The defects being fixed (from the audit)

| # | Defect | Fixed by |
|---|---|---|
| 1 | "No login" promise is false; no working sign-in path for new testers | Welcome screen + the sign-in decision below |
| 2 | Old gate instructions in the docs | Docs rewritten |
| 3 | Admin summary is usually the booking-frequency answer | New summaries built from the mission and problem text |
| 4 | Screenshots still uploading at submit are dropped | Each report waits for its uploads; nothing is sent half-done |
| 5 | Failed uploads explained only in a tooltip, and can't be removed | Visible error text with a Remove button |
| 6 | No autosave; tabs lost | Autosave on the phone and per-mission saving on the server |
| 7 | Hidden sections still submitted | Only answered missions are sent |
| 8 | Pull script prints wrong paths and silently skips screenshots | Rewritten |
| 9 | CSV has no answers | New export bundle |
| 10 | Dead screenshot links in raw Markdown | Bundle links to local files |
| 11 | Admin labels lose context; screenshots pooled | Question text shown; screenshots stay with their report |
| 12 | Ratings and prices not checked on the server | Validated ranges and types |
| 13-23 | Questionnaire too long, duplicated, double-barrelled, leading, about impossible actions, inconsistent scales, stale admin names, English only, thin device info | New study design (section 2) |
| 24 | Accessibility (no labels), old-Android selection styling, no CSP on /feedback | Rebuilt page with real labels and plain styling; headers added |
| 25 | Public screenshots, no retention, no notice, IP spoofable, names unmasked | Section 4 |
| 26 | Broken doc link | Docs rewritten |

## 6. Build order (each piece finished, tested and reviewed before the next)

1. **Screenshot privacy on live.** First, because it is a live exposure.
2. **Database and API for sessions, missions, problems and wrap-up**, with real-database tests.
3. **The new tester page**, with render tests and a phone-size check in the browser.
4. **"Send feedback" inside the app** (customer and provider Help, plus Settings), passing the screen and app version.
5. **Admin overview, problems list and session view**, with render tests.
6. **Export bundle, pull script and the analysis protocol.**
7. **Review, deploy to live, new APK, then a 2-3 tester pilot before the wide send.**

## 7. Decisions for Ken

- **D1. How do testers sign in?** **ANSWERED (Ken, 2026-10-12): email-based sign-in and registration for everyone.** Testers sign up with their own email; provider testers use the real provider sign-up and Ken approves them. Waits on Ken creating the Resend account and DNS records (docs/operations/email-sending-setup.md). The options below are kept for the record.
  - (a) Send me each tester's mobile number. I add it to the server's tester list, and they sign up with their own number and the tester code. Recommended: they test the real sign-up, and each has their own account.
  - (b) I create a numbered test account per tester (customer, plus a ready-approved provider), and you send each person theirs.
  - (c) Both: their own number for the customer side, plus a ready-made provider account, since a real provider sign-up needs ID and NBI documents they won't have. **My recommendation is (c).**
- **D2. Retention:** 180 days for screenshots and contact details? (A proposal; it goes into the privacy notice.)
- **D3. Languages for the page itself:** English only, with "answer in any language" (recommended for now). Or should I also write Tagalog and Bisaya versions? Those would need a native speaker to check them before use.
- **D4. A thank-you for testers** (for example load, or a GCash amount)? It improves completion. Your call; the page just shows the wording you choose.

## 8. What the screen check found (added 2026-10-12, after mapping every app screen against the missions)

Bad news first: the worker missions cannot run as planned yet.

- **D5. Worker test accounts.** A worker can only be approved after a full application: ID front and back, NBI clearance and a selfie. A tester who stops at "Documents" leaves only a draft, so there is nothing to approve. Options:
  - (a) Testers upload any photo as a stand-in for each document on the tester server, and Ken approves them in admin. This is recommended: it tests the real sign-up and approval, and the tester server holds no real money or real workers.
  - (b) Claude creates ready-approved worker accounts for each tester's email.
- **D6. Testers outside Metro Cebu.** Booking needs an address inside Cebu City, Mandaue, Lapu-Lapu or Talisay. Worker sign-up needs the phone's GPS inside the chosen city, or it stops at step 2.
  - The customer mission now says "use an address in Cebu City".
  - The worker sign-up cannot be worked around without a change. Are all testers in Cebu? If not, should the tester server temporarily accept any location for worker sign-up? That is a code change to a check; Ken's decision.
- **The "customer or worker?" choice appears only once**, right after sign-up. Testers who will test both sides must choose "I provide services" at that moment; workers keep full customer access. The tester guide and Message 2 say this.
- **Mission wording was corrected** against the real screens:
  - aircon: stop on the payment-choice screen;
  - cancel: a concrete "tomorrow 9 AM" case;
  - trust: what onService checks;
  - worker sign-up: no approval promise;
  - hours: Saturday 8 AM to 12 noon;
  - services: worker prices are set by the catalog, so the mission asks what customers would pay;
  - jobs: no app button words.
- **Things testers will trip on, already known:**
  - Service descriptions are empty in the seed catalog ("Scope details pending"), so "what the cleaning includes" can't be answered until descriptions are added in admin.
  - Search does not find "leak", "tap" or "gripo".
  - The cancellation answer shown (75%) differs from what the code refunds (E09, open).
  - The app shows version "0.1.0" everywhere instead of 1.0.1.
  - Two screens still tell people to sign in "with your verified mobile number".

  The last two are being fixed. The others are left on purpose, because finding them is what the test is for.

## 9. Build notes (2026-10-13)

- The in-app floating "Feedback" button shows only on the main tab screens (Home, Bookings, Wallet, Profile; worker Dashboard, Jobs, Earnings, Profile), above the tab bar. It hides while the keyboard is open. On job and booking screens it covered the main action buttons, so it was taken off them.
- The Help and Settings rows ("Send feedback or report a problem") and the floating button appear only in builds with `EXPO_PUBLIC_TESTER_FEEDBACK=1`: the tester web app and tester APKs. A production build never sends real customers to the tester study.
- Super admins can delete a tester's answers completely (Testers tab, "Delete this tester's answers"). The privacy notice promises this.
- Still open: filtering problems by side needs an API change (not built). Retention (D2) and languages (D3) are Ken's decisions.
