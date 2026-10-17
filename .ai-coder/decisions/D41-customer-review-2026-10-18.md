# D41: Customer side review, questions for Ken

**Date:** 2026-10-18
**Asked by:** Claude, after the customer review Ken asked for on 2026-10-17 (docs/qa/customer-review-2026-10-17/).
**Status:** MOSTLY DECIDED (2026-10-18). Ken answered Q1 to Q6 and point 7, approved the recommendations for Q7 to Q15, Q18 to Q26 and Q32 to Q56, approved Google address search (Q16, waits on his billing) and the web-server change (Q17), and chose one release at the end. Still open: Q27 to Q31 (tester wallet credits, the E14 payment option, the attorney request, the batch order, the store listing text). Work that needs no answer goes ahead (Batch 0, then Batch 1a in 02-AUDIT-AND-PLAN.md section 4).

The full reasoning, file references and batch plan are in `docs/qa/customer-review-2026-10-17/02-AUDIT-AND-PLAN.md` (section 5 has the same questions with more detail). Ken can answer with the question number and "yes", "no" or a different choice. Claude's recommendation is given first.

## Already decided (not asked again)

- S1 (Ken, 2026-10-17): storage is not a blocker. 20 photos, 2 videos of up to 5 minutes, 5-minute voice note, large files, common formats, admin-editable limits, a free-space guard, storage kept swappable.
- House logo everywhere, no "oS", no orange brand marks; say "Service Provider"; D38 request-first; E14 wallet only (Ken, 2026-10-14).

## Needed for Batch 1

| # | Question | Recommendation |
|---|---|---|
| Q1 | Hide the Recurring and Projects buttons for now (code stays)? | Yes |
| Q2 | "When": day plus a time window, or an exact clock time? | Day plus window |
| Q3 | Is the chosen day a wish the Service Provider can counter in the quote, or a must? | A wish |
| Q4 | Chat header shows the Service Provider's business name with the person's name under it; "Report" moves into a "..." menu? | Yes to both |
| Q5 | Drop the "Top-ups" wallet filter while top-ups are off? | Yes |
| Q6 | Remove "Verified escrow", the escrow text and "held in escrow" everywhere (including the pay screen); change "cancel for a full refund" to "you can wait or cancel the booking"? | Yes (removes claims, adds none) |

## Needed for Batch 2

| # | Question | Recommendation |
|---|---|---|
| Q7 | Category tap goes straight to the request form (no job-type list), with one line "You agree the price in the app before work starts"? | Yes |
| Q8 | Categories in this order: Cleaning, Plumbing, Electrical, Aircon, Handyman, Appliance, TV, Computer service? | Yes |
| Q9 | TV as its own category, or a tile that opens Appliance? | Its own category |
| Q10 | Show TV and Computer to customers before any Service Provider covers them? | No: add them hidden from customers, turn each on once an approved Service Provider covers it |
| Q11 | Hide Painting, Pest Control, Roofing and Landscaping from customers on the tester server (through a new admin switch)? | Yes |
| Q12 | Gallery videos: (a) size cap with a "trim it" message plus in-app 720p recording, (b) third-party compressor (new company), or (c) server conversion? | (a), 500 MB per video default, editable, after the disk guard is made strict |
| Q13 | Accept .webm videos (what desktop browsers make) as well as MP4, MOV and 3GP? | Yes |
| Q14 | Keep chat voice notes at 60 seconds with their own setting? | Yes |
| Q15 | Raise the disk guard from 5 GB free to 10 GB free until storage moves? | Yes |
| Q16 | (D24) Google address search and pin lookup through our server, Philippines only, daily cap and budget alert? Needs new keys, Ken's check of the Android key, and an attorney line in the privacy notice | Yes |
| Q17 | When may Claude load the new web-server settings (video, voice, location on the website)? The web server is shared with other sites, so they blink for a moment | A quiet time Ken picks, with Ken watching |

## Needed for Batch 3 (the new look)

| # | Question | Recommendation |
|---|---|---|
| Q18 | Approve the new look (white pages, neutral grays, one action blue, flat lists) and unlock the design contract? | Yes, after a 3-screen mock |
| Q19 | Action blue #0052CC for buttons and links; logo stays #003D9B? | Yes |
| Q20 | Phone's own font, or bundle Inter? | Phone's own font |
| Q21 | Service Provider app changes colour at the same time; tab badge orange to red; retire the TrustStrip? | Yes to all |

## Needed for Batch 4

| # | Question | Recommendation |
|---|---|---|
| Q22 | Is "support Monday to Saturday, 8 AM to 6 PM" true today? | Remove it until staffed |
| Q23 | Company Workspaces only for people who have one; Team Invitations only when an invite is waiting? | Yes |
| Q24 | Firebase for Android phone alerts now or later? | Later; settings say "alerts show in the app" |
| Q25 | Who checks the Tagalog notification text? | Ken to name someone |
| Q26 | Payment Methods while payments are held: wallet only, no brand names or logos? | Yes |

## Money and legal (do not block the screens)

| # | Question | Recommendation |
|---|---|---|
| Q27 | Credit tester wallets so testers can finish a booking (after D33 adds a maximum and a preview)? | Yes |
| Q28 | E14: Option A (PayMongo Checkout Sessions), PayMongo test keys, confirm which methods the merchant account has? | Option A |
| Q29 | Ask the attorney about a customer wallet balance that cannot be withdrawn (e-money) and how long job photos and videos may be kept? | Yes, one request |
| Q30 | Approve the batch order 0, 1a, 1b, 2, 3, 4, then 5 if Q16 is yes? | Yes |
| Q31 | Rewrite the store listing text (it claims escrow, GCash and Maya, and lists old categories) with Batch 2? | Yes |

## Answers

### Ken, 2026-10-18, in chat (Q1 to Q6, plus a new point 7)

Ken's words, kept as written, then how Claude applies them.

1. **Q1** (Recurring and Projects): "make it more improved and UX / UI friendly"
   - Applied as: remove the separate Recurring and Projects buttons from the Bookings header (both lead to empty or dead-end pages today).
   - Any recurring series shows inside the Bookings list itself, with a small "Repeats" tag, as Ken asked in K15. None exist today, so nothing extra shows.
   - The tip screen no longer sends customers to the dead-end "can't repeat automatically" page; it goes back to the booking.
   - A finished booking gets a "Book again" button. It opens a new request already filled in (same category, address and description), which the customer can edit and send like any request. This is the common pattern in service apps, and it works with request-first booking, unlike the old fixed-price Recurring.
   - Not done without Ken: sending a "Book again" request to the same Service Provider first. That would change who gets each request (D38 first-to-quote), so it is a later question for Ken, not part of this answer.
   - Projects is hidden from customers (the code and admin page stay) until it has a real use.
2. **Q2** ("When"): "do whats the best and most common here"
   - Applied as: a date strip (Today, Tomorrow, then the next days) plus time-window chips (Morning 8 AM to 12 PM, Afternoon 12 to 5 PM, Evening 5 to 8 PM), and an "As soon as possible" choice. This is the most common pattern in home-service booking apps. Window times are admin-editable settings, not code.
3. **Q3** (wish or must): "its a request by the customer but provider can choose to also communicate and have it changed"
   - Applied as: the chosen day and window are the customer's preferred time. The Service Provider sees it on the lead, it is pre-selected in their quote, and they may offer a different time in the quote or the chat. The customer sees the quoted time before accepting.
4. **Q4** (chat business name; Report into a menu): "do whats very best here for UX and UI"
   - Applied as: yes to both. The chat header shows the photo, the business name and, under it, the person's name and "Service Provider". Report moves into a "..." menu in the header and in a long-press on a message.
5. **Q5** (Top-ups filter): "do whats very best, i think most cx wont be loading money until during payment though but maybe allow both as long as it works well"
   - Applied now: the wallet filter shows only the kinds of entries that can exist. "Top-ups" appears only when top-ups are switched on (from the server's own setting), so it reappears by itself later.
   - Recorded for later, NOT built now: when payments reopen (E14, a money hard stop that still needs Ken, PayMongo test keys and the merchant check), the design should let customers pay at checkout directly, and also allow optional top-ups. Ken expects most customers to pay at the moment of payment rather than load money first. This does not switch on any payment.
6. **Q6** (remove escrow and full-refund wording): "yes if this is best"
   - Applied as: yes. Remove "Verified escrow", the escrow boxes and text, and "held in escrow" everywhere listed in 02-AUDIT-AND-PLAN.md section 1 point 2. "Cancel for a full refund" becomes "You can wait or cancel the booking". No new claim is added in their place.
7. **New point 7:** "i also notice too much wordy explanations across all areas of the customer screens and options actually and you should look and fix that to more simple things, obvious things that need no explanation. other apps are not so wordy and just have clear understandable options"
   - Applied as: a wording cut across every customer screen, not only Home and the request form. Short titles and labels, no explaining paragraphs under options, empty states of one line plus one button, errors that say what to do in a few words.
   - Kept: wording that is legally required or protects the customer (Terms, privacy and data-rights pages, the F#10 disclaimer, a cancellation fee shown before it is charged, consent checkboxes). Those can be shortened only where the meaning is unchanged, and legal pages are not rewritten (attorney).

### Ken, 2026-10-18, second answer (three questions asked in chat)

1. **Q7 to Q15 and Q18 to Q26:** Ken chose "Yes, use your picks". Claude builds with the recommendations written above. For the new look (Q18), Ken still sees a 3-screen preview before every screen changes, as that recommendation says. Not included: money, legal and server items (Q16, Q17, Q27 to Q31 are handled separately).
2. **Q17 (shared web server):** "you can do what is needed, even restart etc.. as long as the server comes back within a minute". Applied as: Claude may load the new web-server settings, and restart the web server if needed, provided each interruption is under one minute. Claude tests the new settings first, prefers a graceful reload (no interruption) over a restart, keeps a copy of the old settings to put back, and checks every site the web server serves right after. This permission covers this change, not later ones.
3. **Q16 (Google address search):** "i gave the key full access to all services and the key you have should work actually so double check what you did and it can do more actually". Applied as: Ken wants address search. Claude checks what the existing key can really do (address search, pin-to-address lookup) before asking for anything new, and builds it through our server. Open point raised back to Ken: a key that works for every Google service and also sits inside the Android app can be copied out of the APK by anyone and used on Ken's bill; Claude's advice is in the reply to Ken and in the private records.

## New questions from the second audit (2026-10-18), Q32 to Q56

The second audit covered the screens the first one skipped: after Send, the end of a job, search, Help, support, sign-in and account. "Money or legal" marks a hard stop: Claude does not build that part without Ken's answer. Recommendation first.

- **Q32 (money or legal).** Entering a referral code puts ₱50 of wallet money into an account at once. There is no off switch, and admin cannot see or change the amount. May I add an admin switch that is off by default, and hide the page now?
  - Options: (a) Switch it off now (admin switch, default off, page hidden), and decide the amounts and rules later. (b) Keep it on, but only for brand-new customers, with an amount you set in admin. (c) Leave as is.
  - Recommendation: (a). It gives money away while payments are on hold (E14), and before the attorney has looked at stored wallet value (D41 Q29).
- **Q33 (money or legal).** Suki has three open money problems. Points pay out 100 times too little (E25, open since August). The '% off' is quietly taken out of the Service Provider's quoted price, and they are not told. And 'book your Suki' cannot work while the first Service Provider to quote wins (D29, open). Should Suki be hidden for launch, and if it stays, who pays the discount?
  - Options: (a) Hide the Suki screen, the Home Suki card and the menu entry, and switch off Redeem and the automatic discount on the server until you decide. (b) Keep Suki: answer E25 with the Option 1 fix; the Service Provider pays the discount and sees it before quoting; decide D29. (c) Keep Suki, with onService paying the discount as a separate line.
  - Recommendation: (a). Nobody can reach a Suki tier today, so hiding it costs nothing now and avoids three money decisions before launch. If it stays, call it 'My Suki' in menus.
- **Q34 (money or legal).** Help, and the Terms page the confirm screen links to, show refund percentages, a 'full refund plus ₱200 platform-funded apology credit' and 'refund to original payment method within 5-10 business days'. E09 says these numbers do not control the real refund, and refunds go to the wallet. Until you decide E09 and the attorney has looked, what should customers see?
  - Options: (a) Help and the Terms cancellation section show only the short policy intro, as the confirm screen already does (no percentages, no ₱ credit, no days), and the attorney gets the full lines. (b) Keep Help and Terms as they are, and point the confirm screen's link to a short neutral 'How cancelling works' page. (c) Leave as is.
  - Recommendation: (a). It removes numbers that may be wrong and adds no new claim. The Terms change goes to the attorney first.
- **Q35 (money or legal).** Two of your answers clash. Q6 says remove escrow wording everywhere, and point 7 says the F#10 disclaimer is not rewritten. The 'Does the platform provide insurance?' answer in Help and in Safety is the F#10 disclaimer text (D14r-10). It lists 'payment and escrow records', 'NBI and identity review' and 'a 48-hour dispute filing window' as platform protections (help.tsx:92, safety-and-support.tsx:109). Which rule wins for those two paragraphs?
  - Options: (a) Remove only the escrow words now (adding nothing), and send the changed paragraph to the attorney with the F#10 packet. (b) Leave both paragraphs untouched until the attorney sends final wording. (c) Remove the escrow, NBI and 48-hour mentions together now.
  - Recommendation: (a). It follows Q6, adds no claim, and keeps the rest for the attorney. D14r-10 point 2 should also be corrected, because it asks the attorney to list escrow, NBI and the 48-hour window as protections.
- **Q36 (money or legal).** Right above Confirm, the 'Job complete' screen says payment will be released from escrow and the customer has 48 hours to file a dispute. In the code, confirming ends disputes at once, and doing nothing confirms the job after 24 hours (E18). Help (help.tsx:72) and Safety (safety-and-support.tsx:99) repeat the 48 hours. Until you decide E18, may I take the 48-hour sentence off these screens, adding nothing new? The escrow words go under Q6, and the F#10 paragraphs follow the question above.
  - Options: (a) Remove the sentences and add nothing; customers still see 'Report a problem'. (b) Say plainly: 'After you confirm, you can no longer report a problem in the app.' (c) Decide E18 now: Option A (hold the payment for the full 48 hours) makes the promise true.
  - Recommendation: (a) now, and E18 Option A when you can.
- **Q37 (money or legal).** Before a customer cancels a paid booking, should the app show 'You get ₱X back to your onService wallet', worked out by the same code that makes the refund?
  - Options: (a) Yes, once E09 is decided, using a server preview built on the real refund math. (b) No amount before cancelling; show it only afterwards. (c) No amount at all (as today).
  - Recommendation: (a), after E09. Until then, the app shows no amounts and links to the wallet after cancelling.
- **Q38 (money or legal).** A customer can approve extra parts, then find their wallet cannot pay. The approval quietly expires the next day while the Service Provider waits. While top-ups are off, what should Approve do?
  - Options: (a) Show the wallet balance and the full extra total before Approve (I am doing this part now), and when the wallet is short, show 'Message support' instead of Approve. (b) Allow approval as today, with the balance shown. (c) Send every change order to support while top-ups are off.
  - Recommendation: (a).
- **Q39 (money or legal).** While request-first booking is on, the server still accepts old fixed-price bookings from old app versions or direct calls. The old fixed-price screens also still carry a refund promise, a Suki-points line and escrow text, which would come back if request-first were ever switched off. What should happen?
  - Options: (a) Refuse new fixed-price bookings while request-first is on (with 'Please update the app'), raise the minimum app version with the next APK, and take the old screens out of the app. (b) Keep the old flow as an emergency fallback, and clean its wording now. (c) Leave as is.
  - Recommendation: (a). D38 made request-first the booking model, and a second live booking path is a risk with no use today.
- **Q40 (money or legal).** Help, Terms and Data Rights tell customers to email support@onservice.ph, privacy@onservice.ph and dpo@onservice.ph. On 2026-10-12, onservice.ph had no mail records, and the Data Protection Officer appears under two different addresses. Which inboxes are real, and when will onservice.ph receive mail?
  - Options: (a) Until mail works, Help shows only 'Message support' in the app; you pick one DPO address, and the attorney confirms it in the privacy text. (b) Set up mail now for support@ and privacy@. (c) Leave as is.
  - Recommendation: (a) now, then (b) when you set up Resend and the GoDaddy mail records.
- **Q41 (money or legal).** The Data Rights screen (correct my information, accept an updated policy) cannot be opened from anywhere in the app. Terms tells customers to use 'Data & Privacy', but Profile calls it 'Account & Data'. Terms also says customers can withdraw marketing consent, and no screen lets them.
  - Options: (a) Add rows in Account & Data (Download my data, Correct my information, Close my account); rename the Profile row to the name Terms uses, so no legal text changes; ask the attorney which deletion wording is right and whether a marketing on/off switch is needed. (b) Merge both screens into one, and update Terms through the attorney. (c) Leave as is.
  - Recommendation: (a).
- **Q42.** If a customer accepts a quote but does not pay before the job time, the booking stays 'payment pending' with the Service Provider assigned, and payment is refused after the job time. The customer can cancel it by hand, but nothing closes it automatically. What should happen?
  - Options: (a) Close it automatically at the job time, tell both sides, and offer the customer 'Send this request again'. (b) Send it back to other Service Providers automatically. (c) Leave it for support or the customer to close.
  - Recommendation: (a). It is the simplest option, and no money has moved. With one-tap 'Confirm and pay', this gap is normally zero.
- **Q43.** Today every customer wallet is at ₱0.00 and top-ups are off, so no request-first booking can be paid. Should a customer be stopped before sending a request, or allowed to send and told at the quote?
  - Options: (a) Let them send, and at the quote show the balance with 'Decline this quote' and 'Message support'. (b) Block 'Send request' when the wallet is below a minimum, with one line saying why. (c) Also credit tester wallets (D41 Q27, a money item still open) so testers can pay.
  - Recommendation: (a) plus (c). Blocking would stop testers from trying the request flow at all, and Q27 is the real fix for testing.
- **Q44.** If a Service Provider cancels a paid job, the request simply closes. Should it go back to other Service Providers automatically?
  - Options: (a) Not for launch: the customer sees why it was cancelled, plus a prefilled 'Send this request again' button. (b) Yes: reopen it to other Service Providers automatically. (c) Leave as is.
  - Recommendation: (a). It reuses the 'Book again' pattern you approved (D41 Q1) and adds no new dispatch rule.
- **Q45.** A request that found no Service Provider online at the start never closes. The customer sees 'Our team has been alerted' with no end date. How long should it stay open?
  - Options: (a) The same 72 hours as other requests, as an admin setting, with a notice when it closes. (b) 24 hours. (c) Never; support closes it. (d) Also re-send it when a matching Service Provider comes online (a D38 dispatch change).
  - Recommendation: (a).
- **Q46.** The first-run slides say 'Every provider is NBI-cleared, ID-verified, and rated by customers'. Help and Safety describe 'NBI clearance review', sign-up and role select say 'trusted professionals', and some Service Providers show a blue 'Verified' badge that is really their commission tier (and 4 of the 5 tier badges are hard to read). May I remove these, the way Home was cleaned up (Bug 889)?
  - Options: (a) Remove the 'every provider' slide and 'trusted', stop showing commission tier badges to customers, and keep at most one neutral Help line you approve. (b) Keep the Help description of what Service Providers submit, remove only the slide and the badge, and make the remaining badges readable. (c) Keep everything, and only fix the badge contrast.
  - Recommendation: (a). It removes claims and adds none. The NBI mention inside the F#10 disclaimer paragraphs follows the F#10 question instead.
- **Q47.** People whose number is not on the private tester list cannot sign up: texts do not reach Philippine carriers, and email codes are off until Resend is set up. Until one of them works, what should the sign-in screen do?
  - Options: (a) Say plainly 'onService is open to invited testers for now' (editable in admin) and refuse other numbers. (b) Set up Resend now, so new people can sign up by email. (c) Leave it; after my fix they at least see an error instead of 'code sent'.
  - Recommendation: (a) until (b) is done.
- **Q48.** A new customer goes through about 6 screens before Home: a second splash, 3 intro slides, a 'Welcome back' page, a 3-field form, the code, then a 'How would you like to use onService?' page where becoming a Service Provider is the highlighted choice. Switch to the Maxim and Grab pattern?
  - Options: (a) One 'Enter your mobile number' screen for new and returning people, the code, a name step only for new numbers, then Home; drop the intro slides; 'Become a Service Provider' moves to Profile, plus a small link on the number screen. (b) Keep separate Log in and Create account, and only remove the role step for customers. (c) Keep as is.
  - Recommendation: (a).
- **Q49.** Finishing a job takes 4 screens: Job complete, Rate and review, Tip, Make recurring. Should it be one screen?
  - Options: (a) One 'Job done?' screen: the Service Provider's photo and name, Confirm, then 5 stars and an optional comment on the same screen, with details behind 'Add details'. 'Add a tip' becomes an optional row on the booking, shown only when the wallet can cover it. No 20-character minimum for a written review. (b) Keep the steps, with the Tip fix, and skip Tip when the wallet is ₱0. (c) Keep as is, with the Tip fix.
  - Recommendation: (a).
- **Q50.** 'Request status' and 'Booking details' are two near-identical pages for the same request, and they link to each other. Merge them into one page per request?
  - Options: (a) One page: status at the top, then the quote or the Service Provider, then the details. (b) Keep two pages and remove the repeated parts.
  - Recommendation: (a).
- **Q51.** 'Track Booking' never shows where the Service Provider is, because live location was never built. On a phone it is a map of the customer's own address; on the website it shows developer text and raw coordinates (that part I am fixing now either way). Replace the map with a simple status timeline until live location exists?
  - Options: (a) A timeline (Paid, On the way, Arrived, Working, Done) with the Service Provider's photo, name and a Message button. (b) Keep the map on phones, and use the timeline on the website only.
  - Recommendation: (a).
- **Q52.** A theft dispute cannot be sent without a photo, even though the stolen item is gone. The server itself does not require one. Make the photo optional for theft?
  - Options: (a) Optional for theft, still required for damage. (b) Keep it required.
  - Recommendation: (a).
- **Q53.** When support resolves or closes a case, the customer gets no message, no reason, and cannot reply. Must support always write a reason the customer can see, and may the customer reply to reopen the case?
  - Options: (a) A note the customer can see is required to resolve, close or set 'Waiting on you', with a notification; a reply reopens the case within 7 days (an admin setting). (b) A required note only, with no reopen. (c) As today.
  - Recommendation: (a).
- **Q54.** Search misses 'plumber', 'electrician', 'air con', and local words such as 'sira', 'guba', 'linis', 'tulo' and 'barado'. I will build better matching and a word list you can edit in admin. Who checks the Tagalog and Cebuano words, and the Tagalog notification text from D41 Q25?
  - Options: (a) I add a starter list marked 'unreviewed', and a person you name reviews it in admin. (b) English word stems only, until someone is named.
  - Recommendation: (a).
- **Q55.** After sending a request, customers cannot add a photo or a detail; the page tells them to contact support. Should they be able to?
  - Options: (a) Not for launch: replace the support line with 'Change request', which cancels the request and opens a prefilled new one. (b) Build 'Add details' on open requests (a new API; every notified Service Provider sees the change). (c) Leave as is.
  - Recommendation: (a).
- **Q56.** When email sign-in is switched on, how do existing phone customers get their real email onto their account?
  - Options: (a) An 'Add email' step in the app that needs a code sent to both the phone and the email. (b) Support attaches emails by hand (a live data change, which would itself need your yes each time). (c) Testers make new accounts and lose their bookings and wallet.
  - Recommendation: (a), built after Resend is set up.


## Answers to Q32 to Q56, and delivery (Ken, 2026-10-18, third answer, asked in chat)

1. **Q32 to Q56:** Ken chose "Yes, use all your picks", including the 10 money or legal ones (Q32 to Q41). Claude builds with the recommendation written under each question. Each money or legal pick removes a promise or switches off a money feature and adds none. Anything marked for the attorney still goes to the attorney; no legal page is rewritten.
2. **Delivery:** Ken chose "Only when all done": keep building and release one big update at the end (tester server and a new APK), instead of a release after each batch. This replaces, for this customer work only, the standing rule to deploy each verified piece the same session. Claude still pushes each verified slice to GitHub master (so CI checks it and nothing is lost), but does not deploy to the tester server or publish an APK until the whole customer side is done, unless Ken says otherwise.
