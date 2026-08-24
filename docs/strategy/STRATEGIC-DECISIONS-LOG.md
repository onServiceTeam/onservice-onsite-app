# STRATEGIC DECISIONS LOG

> **Current-source warning (2026-08-24):** this log contains point-in-time decisions that were later superseded. DECISION-001 (Boracay-first) is replaced by city-agnostic Metro Cebu first. DECISION-006's customer fee is now 0% under migration 137. Founding tier now exists. The current external PayMongo hosted flow is blocked by E14, provider fixed-price authority by E16, and SiguradoShield/guarantee language by E10/F#10. Use `AGENTS.md`, active escalation/decision records, and the operations handbook as current authority.

This document records every settled strategic decision and where it came from. Future me, future Claude, future AI coder: read this before changing strategy. Do not regress these decisions without explicit Ken sign-off.

---

## DECISION-001 — Launch city: Boracay

**Settled:** April 16, 2026 (chat 771a0b44-e718-4204-a12c-9ddea249ed5e)
**Path:** Boracay primary at launch → Kalibo (m6) → Iloilo (m12)
**Rationale:**
- Ken lives in Boracay (zero relocation cost, can personally walk operations)
- 10.32 sq km extreme density makes single-driver routing efficient
- Tourism accommodation B2B (hotels, condotels, Airbnb operators) provides recurring revenue from m2-3
- Zero serious branded competition in Aklan / Western Visayas
- Same ferry route (Aklan → Iloilo) lets Kalibo and Iloilo share back-office

**Considered and rejected:**
- GenSan launch (Ken doesn't live there, ₱45-60K/month city manager required)
- Davao launch (too expensive to crack)
- Cebu launch (most contested)
- 3+ cities at launch (Homejoy mistake)

**Override authority:** Only Ken, with explicit reasoning, in a new chat or message.

---

## DECISION-002 — Launch service mix: 5 services

**Settled:** April 16, 2026 (Ken pushed back on Claude's "1 service" recommendation)
**Services activated:** Cleaning, AC/HVAC, Plumbing, Electrical, Painting
**Inactive at launch but in catalog:** Pest control, moving, carpentry, appliance repair, lawn, spa, laundry, deep cleaning, handyman (toggleable in admin)
**Phasing:** All 5 active from day one, additional categories activated based on validated demand

**Considered and rejected:**
- Single-service launch (AC cleaning only) — Ken pushed back, said multi-service from day one
- All 14 categories at launch (would dilute focus and ops)

**Override authority:** Ken can toggle any inactive category in admin without re-approval. Adding new categories beyond the 14 in spec requires architectural review.

---

## DECISION-003 — Provider model: founding-provider freelancers with branded shirts

**Settled:** April 16, 2026
**Model:**
- Freelancers (not employees) bringing their own equipment
- Wear branded onService shirts during jobs (uniform standard)
- NBI clearance + skills test + 2 references mandatory
- 3-job probation period with mandatory before/after photos
- Founding tier (first 50 providers per city): 10% commission for 12 months
- Standard tiers: New 15% / Verified 13% / Pro 11% / Elite 9% (verified in `packages/api/src/config/platform.config.ts`)

**Status:**
- ✅ Standard tiers in code
- ⬜ Founding tier (10%) NOT YET in code — Phase 03 should add it OR Ken drops the recommendation

**Override authority:** Ken can change tier rates in admin (Phase 03 runtime config). Adding the founding tier requires a code change.

---

## DECISION-004 — Insurance: SiguradoShield 3-layer

**Settled:** April 14, 2026 (chat 1a2c5241), reinforced April 16
**Architecture:**
- Layer 1: Self-funded platform guarantee fund (1.5% of service fees, ships with launch)
- Layer 2: Per-job optional coverage (Igloo + Malayan, partner-dependent, NOT YET wired)
- Layer 3: Tiered provider liability (provider cost, partner with Singlife or similar)

**Coverage limits:**
- Layer 1: ₱25K per claim (property damage / incomplete work / theft with police report)
- Layer 2: ₱250K per claim (when partnership signed)

**Override authority:** Layer 1 stays. Adding Layer 2/3 is partnership-dependent — Ken decides timing.

---

## DECISION-005 — Payment provider: PayMongo primary, Xendit secondary

**Settled:** Per `COMPLETE-PH-Home-Services-Platform-Specification.md` section 5
**Why PayMongo:**
- PayMongo Platforms product is designed for marketplaces (sub-merchant onboarding, payment splitting, wallet management, programmatic payouts)
- Faster integration

**Why Xendit secondary:**
- Backup if PayMongo limits hit
- Direct GCash integration option for >₱500K/month e-wallet volume

**Codebase status:** PayMongo is integrated. Xendit is not (yet).

**Override authority:** Ken can add Xendit later. Removing PayMongo requires migration plan.

---

## DECISION-006 — Commission and fee structure

**Settled:** Per code (`packages/api/src/config/platform.config.ts`) and reaffirmed April 16
**Values:**
- Service fee: 10% of booking amount, charged to customer
- Min service fee: ₱25 / Max: ₱500
- Commission rates (provider): 15% New / 13% Verified / 11% Pro / 9% Elite
- Guarantee fund allocation: 1.5% of service fee
- Min withdrawal: ₱100
- Cancellation tiers: per FR-102 (in code)
- Escrow auto-release: 24 hours after completion
- Dispute window: 48 hours

**Override authority:** Configurable via Phase 03 runtime config. Ken can change in admin without code change after Phase 03 ships.

---

## DECISION-007 — Multi-quote bidding: KEEP enabled

**Settled:** April 16, 2026
**Rationale:** Plumbing, electrical, painting need quote-based pricing because scope is unknown until provider visits. Removing multi-quote would break custom-quote workflows for these categories.

**Earlier (April 14) advice was wrong** — recommended parking multi-quote behind a feature flag. That was reversed.

**Override authority:** Don't park this without Ken's explicit instruction.

---

## DECISION-008 — Database migration runner: node-pg-migrate

**Settled:** Per actual repo configuration (`scripts/run-migrations.sh`, `packages/api/package.json`)
**Commands:**
- Up: `npm run migrate:up --workspace=packages/api`
- Down: `npm run migrate:down --workspace=packages/api`
- Create: `npm run migrate:create --workspace=packages/api -- migration-name`

**Override authority:** Don't switch migration tooling without strong reason. Migrations 001-049 already exist.

---

## DECISION-009 — Frontend stack: shadcn/ui v4 + Tailwind 4 + lucide

**Settled:** Per repo state and Phase 01 plan
**Stack:**
- React 19 + Vite 6
- Tailwind CSS 4 (already installed)
- shadcn/ui v4 components (already chosen per package.json description)
- Recharts 3.8 (already installed but unused — Phase 04 wires it)
- Lucide-react icons (Phase 01 adds — replaces 73+ emoji)
- Zustand for state (already in use)

**Mobile stack:**
- Expo SDK 55 + React Native 0.83
- expo-router for navigation
- react-native-mmkv for encrypted storage
- react-native-maps for map
- @sentry/react-native for errors

**Override authority:** Phase 01 chooses specific shadcn components. Adding alternative UI libraries is forbidden.

---

## DECISION-010 — Workflow: AI coder runs autonomously

**Settled:** April 27, 2026 (this conversation, after Ken's "I prefer not to gate every phase" message)
**Rules per `.ai-coder/AUTONOMOUS-EXECUTION-PROTOCOL.md`:**
- AI coder runs Phase 00 → Phase 12 without Ken-gating
- Auto-proceeds on passing `verify-master.sh`
- Stops only on 5 hard-stop conditions
- Ken audits at his pace, not phase-by-phase
- Brief one-message status update per phase

**Override authority:** Ken can pause anytime by saying "stop" or "pause" — AI coder stops at next clean checkpoint.

---

## How to add a new decision

If a new strategic decision is made, add it as DECISION-NNN in this file with:

1. The decision (what was settled)
2. When and where (chat URL or session ID)
3. Rationale
4. What was considered and rejected
5. Override authority

This is the source of truth. If the AI coder, future Claude, or future Ken disagrees with a decision here, the answer is: open the override question explicitly. Don't silently regress.
