# D14r-10 — Legal disclaimer wording (open, Ken-blocked)

Decision pending: Ken to provide attorney-reviewed final wording for the no-insurance disclaimer.

## Status

- **Audit Finding #10** (`.ai-coder/PHASE-14-REMEDIATION-MASTER-INSTRUCTION.md` lines 550-619) flagged three customer-facing screens shipping with literal `TODO_KEN_LEGAL_DISCLAIMER` placeholder text:
  - `apps/mobile/app/customer/terms.tsx:56`
  - `apps/mobile/app/customer/help.tsx:70`
  - `apps/mobile/app/customer/safety-and-support.tsx:101`

- **R10 (this remediation)** swapped the placeholder for **interim attorney-reviewable wording** drawn from the audit's Path B suggestion. The interim text is in production right now and the placeholder is removed.

- **CI guard** (`apps/mobile/__tests__/no-todo-placeholders.test.ts`) now fails any PR that reintroduces `TODO_KEN_LEGAL_DISCLAIMER` anywhere under `apps/`.

## Open: Ken's lawyer review

The interim wording must be replaced with attorney-reviewed final wording before `v1.0.0-launch-ready`. Ken's commitment: hire a Philippine business attorney for a one-time review (estimated ₱5K–15K, ~1-2 weeks). The attorney drafts the final text covering:

1. Marketplace status — onService PH connects customers with independent providers, is not an insurance provider.
2. Explicit list of platform protections — NBI verification, escrow, masked phones, 48-hour dispute window, rating accountability.
3. Independent-contractor liability — providers are responsible for damage they cause; customer may pursue claims through dispute process.
4. Insurance recommendation — customer should maintain homeowner/renter insurance for losses beyond platform protections.

When wording arrives, replace the interim text in the same three files. The CI guard guarantees the placeholder cannot return.

## Path A vs Path B

The audit offered two paths:

- **Path A (preferred):** Ken hires lawyer; lawyer drafts wording; we ship that wording.
- **Path B (interim):** ship attorney-reviewable interim text; require attorney sign-off before launch tag.

R10 implements Path B, with Path A still required before `v1.0.0-launch-ready`. The interim text is grounded in real platform protections (everything stated is true and verifiable). What requires lawyer review is the legal-effect wording — disclaimer of warranty, disclaimer of insurance liability, dispute-process clause language.

## What R10 ships

- Three placeholder swaps (now in production with interim wording)
- One CI guard test (locks the rule in)
- This decision file (open question for Ken)

## What R10 does NOT ship

- Final attorney-reviewed wording (Ken's lawyer call)
- The `v0.14.1-remediation-10` tag (replaced by `v0.14.1-remediation-10-partial`)
- The `v1.0.0-launch-ready` tag (blocked on this + the F#3/F#4 baseline capture)

## Questions for Ken

1. Will you serve as the legal-review approver yourself (via online templates + light counsel review) or hire a fractional attorney?
2. Approximate timeline for the wording — affects the launch-ready tag scheduling.
3. Should the attorney also review the cancellation policy + DSR-disclosure copy in the same engagement (potentially same ₱5-15K covers all three)?

When you have the wording, paste it into:
- `apps/mobile/app/customer/terms.tsx` (Section 6: Liability and Insurance)
- `apps/mobile/app/customer/help.tsx` (FAQ "Does the platform provide insurance?")
- `apps/mobile/app/customer/safety-and-support.tsx` (Q&A "Does the platform provide insurance?")

Then tag `v0.14.1-remediation-10-final` and proceed.
