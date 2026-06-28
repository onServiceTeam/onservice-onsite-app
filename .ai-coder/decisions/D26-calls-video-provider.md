# D26 — Voice + video calling: which approach and vendor?

Date: 2026-06-29
Status: DIRECTION CHOSEN by Ken (2026-06-29) — build our own on open-source WebRTC (self-hosted LiveKit), NOT Zoom. Remaining open item: final yes on self-host vs starting on LiveKit Cloud, plus go-ahead to stand up the call server (coturn TURN + LiveKit). Calling build is therefore still gated; the chat-moderation foundation proceeds now.
Raised by: AI coder (integration + communication audit, this session)

## Ken's clarification (2026-06-29)

Ken does NOT want phone-number masking. He wants in-app chat + voice + video as part of the customer<->provider communication through the job stages (quote/assessment, after job starts, etc.), built on open-source tech (he named WebRTC), likely "something of our own" rather than Zoom, with admin moderation including transcripts and translation of transcripts.

### Recommendation (refined): build our own on self-hosted LiveKit (open-source, WebRTC-based)
- No per-minute fees; runs on the existing Hetzner box + a coturn TURN server (TURN is mandatory or calls fail on PH mobile NAT).
- Media + recordings stay on our infrastructure — required for the transcript/translation/moderation features AND the strongest NPC RA 10173 posture (vs Zoom holding Filipino consumer call data in the US).
- Embedded in the booking, not a separate meeting app.
- LiveKit Cloud is an optional fast-start with identical app code; can migrate to self-host later with no rewrite.
- Reject Zoom: ongoing license/per-minute, off-brand UX, customer PII + recordings leave our control, weaker privacy story.

### When each channel is available (by transaction phase)
| Phase | Text chat | Voice | Video/meeting |
|---|---|---|---|
| Browse (no booking) | no | no | no |
| Quote / assessment | yes | optional | YES (show the problem -> accurate quote) |
| Booked / scheduled | yes | yes | no |
| En route / arrived | yes | yes | no |
| Job in progress | yes | yes | yes (remote check / remote-only services) |
| Completed / dispute window | yes (read-only after) | no | no |

Rationale: tie comms to a real transaction (less spam + off-platform leakage); put video where it adds the most value (accurate quoting + remote work) as a differentiator.

### Moderation design (depends on holding our own media)
- Record calls WITH CONSENT (display "may be recorded for safety and quality", capture agreement first — RA 10173).
- Auto speech-to-text transcript (Whisper open-source or a cloud STT), then translate (Tagalog/Cebuano <-> English) so an English-reading admin can moderate any call.
- Run transcripts through the SAME off-platform/abuse keyword filter chat already uses (messaging.service.ts BYPASS_KEYWORDS + workers.ts BYPASS_PATTERNS). Chat + calls feed ONE admin review queue.
- Admin recording access is itself audit-logged (reuse the D25 pii_reveal access-log pattern). Define a retention policy.

### Additional recommendations
- Presence (online/offline) so calls ring only when reachable; fall back to chat / scheduled call.
- In-app calling removes the incentive to share phone numbers -> strengthens stay-on-platform retention + escrow/guarantee model.
- Optional later: a paid video-assessment slot as a pre-job consult (revenue + differentiator).

### Build sequencing
1. NOW (no vendor, no cost, no decision): admin chat moderation surface + Messages inbox + user report-message path. Built under a "Communications" admin area so call logs + transcripts slot in later. (Ken approved 2026-06-29.)
2. NEXT (needs Ken's self-host go-ahead + server setup): stand up coturn + LiveKit, add the calls table + token-mint endpoint + call signaling over the existing Socket.io server + mobile call UI, gated by the phase table above.
3. THEN: recording -> transcript -> translation -> feed the moderation queue.

---

## (Original vendor options write-up retained below for the record.)

## Plain-English question

You asked to add chat, voice calls, and video calls between customers and providers (and admin moderation of all of it). Chat already exists and works. Voice and video do **not** exist anywhere in the app, and I cannot build them without you picking a provider, because real calling needs an outside service plus a small recurring cost. This is the one piece I should not decide for you.

## What already exists (so we build on it, not from zero)

- Real-time text chat between customer and provider works today (one thread per booking, Socket.io + Postgres, typing indicators, read receipts, one photo per message). This is solid and reusable.
- The Socket.io server that powers chat can also carry the "call setup" handshake (ringing, accept, decline, hang up). That saves us building a signaling server.
- The app is already a custom build (not Expo Go), so we are allowed to add the native calling library. No blocker there.

## What is missing for calls/video (all net-new)

1. A calling library in the mobile app (the media engine).
2. A way for the app to "ring" when it is closed/backgrounded (CallKit on iOS / ConnectionService on Android via react-native-callkeep).
3. A TURN server. This is the part people forget: on Philippine mobile networks, a direct phone-to-phone media connection usually fails, so calls must relay through a TURN server. Without it, calls connect maybe 60-70% of the time. Every option below either includes TURN or needs us to run one (coturn) on the server.
4. Call screens (incoming-call ring, in-call controls: mute, camera flip, hang up) on both customer and provider sides.
5. A server record of calls (who called whom, when, how long) for support and disputes.
6. If you ever want to record calls: a recording + consent + retention policy. Recording Filipino consumers needs RA 10173 consent handling, so I would treat recording as a separate later decision.

## The options

**Option A - LiveKit, self-hosted on our existing Hetzner box (RECOMMENDED).**
Open-source voice+video. We run it on the server you already pay for, plus a coturn TURN server alongside it. Customers and providers connect in-app, so no phone numbers are ever exchanged (privacy is automatic). 
- Cost: no per-minute fees. Just the server you already have (may need a slightly bigger box if call volume grows). 
- Control: media and any future recordings stay on your infrastructure, which fits the data-privacy posture we have been holding.
- Effort: highest of the managed options because we run the media server + TURN ourselves. Realistic build: ~1.5 to 2.5 weeks of focused work for voice+video + ringing + admin call log.
- Best when: you want low ongoing cost and full control, and are OK with us operating one more server component.

**Option B - LiveKit Cloud or Daily (managed, fastest to ship).**
Same LiveKit tech but they host the media + TURN, OR Daily.co which is the easiest React Native SDK and includes TURN. 
- Cost: usage-based (roughly a few US cents per participant per minute after a free tier; Daily's free tier is generous for early volume). At low launch volume this is small; it grows with usage.
- Control: media flows through their servers (still encrypted in transit; recordings, if any, sit with them unless configured otherwise).
- Effort: lowest. Realistic build: ~1 to 1.5 weeks because we skip running the media server and TURN.
- Best when: you want calls working as fast as possible and are fine paying per-minute as you scale, and can later migrate to self-hosted LiveKit (Option A) without changing the app much.

**Option C - Agora.**
Mature, low-latency, strong network presence in Asia, solid React Native SDK, 10,000 free minutes/month then per-minute. Functionally similar to Option B in tradeoffs. Popular with marketplaces. Slightly more vendor lock-in than LiveKit (LiveKit lets you move between Cloud and self-host).

**Option D - Twilio for phone-number masking only (no in-app video).**
This is a different shape: instead of in-app calls, customer and provider call each other on the actual phone network through a masked number that hides their real numbers. 
- Note 1: your safety screen ALREADY claims "Masked phone numbers (Twilio integration)" but nothing is wired. That copy is currently false and I will correct it regardless of this decision.
- Note 2: Twilio is sunsetting its Programmable **Video** product, so Twilio is NOT a good pick for video. Twilio Voice is fine for masking voice calls.
- Cost: per-minute PSTN + per-number monthly.
- Best when: you want "tap to call my provider" on a real phone call without exposing numbers, and you do NOT need video. This can be added later alongside Option A/B if you want both in-app and phone-call options.

**Option E - Chat + admin moderation now; defer calls/video.**
Ship the chat moderation (which I can build immediately with no vendor and no cost) and hold voice/video for a later release. 
- Best when: you want to focus launch on the booking + chat experience and add calling once there is real usage to justify the cost and the extra moving parts.

## My recommendation

Two-step:

1. **Now, regardless of your vendor choice:** I build the admin chat moderation and a chat inbox. These need no external service, no cost, and no decision from you, and they directly answer "admins ability to moderate chats." The data and the auto-flagging of off-platform attempts already exist; only the admin screens and read endpoints are missing.

2. **For calls/video:** start with **Option B (Daily, managed)** to get voice+video working fast and cheap at launch volume, built in a way that lets us **move to Option A (self-hosted LiveKit)** later if per-minute cost or data control becomes a concern. If you would rather pay once and self-operate from day one, go straight to **Option A**. I would skip Twilio masking (Option D) for v1, because in-app calling already hides phone numbers, which was the point of masking.

Tell me A, B, C, D, or E (and I will write the build plan against your pick). The chat-moderation work in step 1 I can start immediately on your go-ahead.
