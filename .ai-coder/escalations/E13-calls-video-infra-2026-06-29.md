# E13 — In-app calls/video: blocked on paid infra, firewall, and a native build

Date: 2026-06-29
Raised by: AI coder
Status: OPEN — blocked on Ken (infra + paid + native build). App-side scaffolding
can be built behind a flag once Ken greenlights.

## Why this can't ship this session

D27 Phase 6 (= D26) is in-app voice + video between customer and provider during
a transaction, with admin moderation. The design is complete: self-hosted LiveKit
SFU + coturn TURN on the Hetzner box, booking-scoped room tokens minted by the
API, ring/accept/hangup over the existing Socket.IO, mobile call screens, and a
Calls tab in the admin Communications surface. No money moves; the only server-
canonical concern (the LiveKit token) is handled server-side.

But three gates are things only Ken can clear, and one of them I literally cannot
do from here:

1. **Paid infra (Ken's call + likely a bigger box).** Stand up two new containers
   (LiveKit + coturn) on the Hetzner box. The box already runs postgres/pgbouncer/
   redis/api/nginx/prometheus/grafana; SFU + TURN + (later) recording/transcription
   are CPU/bandwidth heavy and likely need a larger instance before real call
   volume. This is a spend decision.
2. **Firewall — THE blocker.** The box allows only inbound 22/80/443 today. WebRTC
   needs UDP/TURN ports opened in BOTH the Hetzner Cloud Firewall AND ufw: 3478
   TCP+UDP, a coturn relay range (e.g. 49152–49252), the LiveKit RTC range (or run
   LiveKit TCP/TURN-relay-only), optionally 5349 turns. Without the UDP ports,
   calls silently fail on Philippine mobile NAT. Only Ken can change the live box's
   network.
3. **DNS + TLS:** a `calls.onservice.ph` A-record + cert (the certbot loop picks it
   up).
4. **Native build (I cannot produce this).** `@livekit/react-native` is a native
   module — it needs a fresh EAS dev + production build and an app-store
   resubmission. This is NOT an over-the-air update like every change shipped so
   far. The web export (app.onservice.ph) can get the LiveKit web SDK behind a
   `Platform.OS` guard, but native mobile calling requires the EAS build.

There is also a real compliance item: call recordings/transcripts are personal
data under RA 10173 — explicit consent capture + retention policy + audit-logged
admin access are needed before recording is enabled (ties to the E10 attorney
track). Transcript translation is already deferred by Ken.

## What I can do without Ken (once he says go)

Land everything app-side behind a `CALLS_ENABLED=false` flag so master stays
green: the `calls` migration, call.service + token endpoint, socket handlers,
the admin Calls tab, the mobile call screens + incoming-call modal, and the jest
mocks/tests. Nothing rings until the infra (1–3) and a native build (4) exist.

## What I need from Ken

1. Approve provisioning + paying for LiveKit + coturn (and likely a bigger box).
2. Open the firewall UDP/TURN ports in Hetzner Cloud Firewall + ufw.
3. Add `calls.onservice.ph` DNS + cert.
4. Greenlight cutting a fresh EAS native build (no OTA path for native modules).
5. Attorney sign-off on recording consent + retention (or ship calls first,
   recording later — the D26 doc sequences recording as step 3, which I recommend).

Decision context: `.ai-coder/decisions/D26-calls-video-provider.md` (Ken already
chose self-hosted LiveKit). Full file-level plan: the D27 design-workflow output.
