# Customer/provider relationship and evidence audit

Date: 2026-08-25
Status: implementation, full mobile suite, and controlled authenticated desktop browser pass complete
Scope: customer provider detail, customer Suki Pros, provider Suki Customers, customer job evidence, and customer change orders

## Why this batch exists

These five screens sit on the relationship between discovery, repeat work, field proof, added scope, provider CRM, and support. They are also the next shell-only surfaces named by the screen ledger after the ProofFlow/core-value audit.

The review treated all action labels and cross-role links as untrusted until the stored booking/provider/customer identifiers and server behavior were traced. It did not assume that a button saying “Book Again” actually preserved the provider.

## Cross-role trace

| Customer/provider surface | Canonical source | Counterpart | Finding before fix | Result |
| --- | --- | --- | --- | --- |
| Customer provider detail | provider profile, catalog-backed provider services, reviews, customer Suki memberships | Admin Provider 360, provider public profile | Phone-only stream; sticky action silently chose the first service; copy implied the viewed provider was preferred even though the booking draft stored no provider | Wide identity/relationship rail plus service/evidence content; current-customer Suki context; first-service action removed; service-specific actions state that assignment is confirmed later |
| Customer Suki Pros | Suki memberships and tier API | provider Suki Customers, provider profile | Read-only cards with no provider destination; no wide composition; product promise exceeded current assignment behavior | Bounded relationship/tier overview, two-column provider grid, and truthful “View services” linkage |
| Provider Suki Customers | provider-customer Suki projection | provider CRM client detail | Read-only loyalty cards even though the canonical client record already existed | Two-column wide grid; each card opens the customer-specific CRM record |
| Customer job evidence | booking plus canonical `booking_photos`; legacy arrays only as fallback | provider capture/checklist/completion, Admin Booking 360 proof summary | Static non-reactive width; only before/after/customer tabs; canonical loading/error ignored; false empty state possible; actor/type/time discarded | Responsive evidence workspace; before/work/after/customer categories; canonical loading/error/retry; actor/type/time retained; legacy provenance labeled; full-size viewer |
| Customer change orders | booking, change orders, wallet | provider change-order request, Booking 360, payment/support | Phone-only cards without original-scope context; evidence could overflow and could not be inspected; failed wallet read displayed as zero | Wide original-scope/proposed-change comparison; wrapping full-size evidence; unknown wallet state is explicit and payment remains disabled |

## Screen checks

### Customer provider detail

Path: `apps/mobile/app/customer/provider/[id].tsx`
Stitch reference: attached onService Stitch direction, applied through the shared tokens and wide workspace pattern
Bug: UX-310

- Colors, spacing, typography, cards, and iconography use the existing centralized system.
- Provider loading, error, missing-provider, service-empty, schedule-empty, review-loading, review-error, and review-empty states are explicit.
- Tablet/desktop uses a bounded two-column workspace. Phone remains one column.
- Portfolio becomes a wrapping grid on wide screens and retains the compact horizontal phone rail.
- Service actions are service-specific and keyboard/button accessible.
- The screen does not claim that opening from a provider profile reserves or assigns that provider.

### Customer Suki Pros

Path: `apps/mobile/app/customer/suki-pros.tsx`
Bug: UX-311

- Existing membership, tier, empty, load, failure, and redemption behavior is preserved.
- Tablet/desktop separates program context from tiers and uses a two-column relationship grid.
- Every provider relationship has a keyboard/button-accessible route to that provider's services.
- E25 remains open. This batch does not change redemption units, settings ownership, balances, or wallet credit.

### Provider Suki Customers

Path: `apps/mobile/app/provider/suki-customers.tsx`
Bug: UX-312

- Existing loading, error, empty, and refresh states are preserved.
- Tablet/desktop uses two columns inside the bounded app workspace.
- The customer ID from the Suki projection is carried to the canonical provider CRM client-detail route.
- No customer contact detail is added to the loyalty projection.

### Customer job evidence

Path: `apps/mobile/app/customer/booking/photos.tsx`
Bug: UX-313

- Both the booking and canonical evidence query settle before an empty result is shown.
- A canonical evidence failure has an explicit retry. Legacy arrays may remain visible, but a warning explains that actor/time provenance is unavailable.
- Canonical items preserve uploader role, evidence type, and upload time.
- During-work, checklist, and issue records are no longer omitted from the customer work record.
- Refresh reloads booking context and canonical evidence.
- Thumbnail and lightbox sizing reacts to viewport width instead of using a module-load constant.
- This is a read surface. It does not claim browser/native photo capture was tested here.

### Customer change orders

Path: `apps/mobile/app/customer/booking/change-order.tsx`
Bug: UX-314

- Original booking context is supplementary and cannot block the canonical change-order ledger if its read fails.
- Tablet/desktop keeps original scope beside proposed changes and actions.
- Evidence wraps and opens in a full-size viewer.
- Wallet loading and failure are explicit. Unknown state cannot be converted to a displayed zero or an enabled payment action.
- Existing approve, decline, and pay services are unchanged. E14 remains the external authorization/top-up hold.

### Browser OTP entry

Path: `apps/mobile/src/components/ui/OTPInput.tsx`
Bug: UX-315

- The browser input behind the six visible cells was 0×0 pixels, which made keyboard, automation, and assistive interaction fragile even though clicking the wrapper could focus it.
- Web now uses a full-size transparent input over the visible cells. Native keeps the existing hidden-input behavior.
- The isolated browser login completed through the repaired visible field for both customer and provider roles.

### Provider client-record route

Path: `apps/mobile/app/provider/_layout.tsx`
Bug: UX-316

- Provider Suki cards carried the correct customer ID, but the provider navigator did not register the dynamic `clients/[id]` screen.
- A hard browser load therefore collapsed `/provider/clients/customer-1` to `/?id=customer-1` and reached the provider home/error boundary.
- The dynamic screen is now registered explicitly. The same hard load remains at the exact client-record URL.

## Assignment hard stop

The audit found a source-of-truth contradiction, recorded as D29:

- Suki and “Book Again” language implies the same provider;
- the booking draft stores only category/service;
- normal matching can choose any provider;
- the current self-assignment endpoint immediately assigns and does not validate service eligibility, service area/radius, schedule, or competing offers.

The recommended future behavior is a validated preferred-provider-first offer with provider acceptance and an explicit customer fallback choice. Until Ken approves that decision, these screens use truthful “View services” and service-start language.

## Behavioral evidence

One bug, one test, one file:

- `bug-ux-310-customer-provider-workspace.real.test.tsx`
- `bug-ux-311-customer-suki-workspace.real.test.tsx`
- `bug-ux-312-provider-suki-crm-workspace.real.test.tsx`
- `bug-ux-313-customer-photo-evidence-browser.real.test.tsx`
- `bug-ux-314-customer-change-order-workspace.real.test.tsx`
- `bug-ux-315-web-otp-input.real.test.tsx`
- `bug-ux-316-provider-client-route-registration.real.test.tsx`

The focused regression set passed 18 suites and 58 tests. The full mobile run passed 345 suites and 774 tests with 84 existing explicit device todos. Repository lint and all workspace TypeScript checks passed.

The controlled authenticated browser pass used an isolated synthetic API, not production accounts or production data. At 1280×720, customer provider detail, customer Suki Pros, customer job evidence, customer change orders, and provider Suki Customers all rendered inside their role-aware desktop shells with no horizontal overflow. The OTP field completed customer/provider sign-in, and the provider client-record URL remained correctly registered. Tablet composition is covered by the real responsive render tests; no live 820px authenticated browser claim is made for this batch because the available controlled browser viewport was fixed at 1280px.

The clean production export passed across 4,268 modules with `EXPO_PUBLIC_API_URL=https://app.onservice.ph`; the bundle contains the production origin and no synthetic `127.0.0.1:7390` origin.
