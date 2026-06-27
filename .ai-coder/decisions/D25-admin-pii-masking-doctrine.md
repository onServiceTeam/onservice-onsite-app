# D25 — Should admin detail pages mask customer/provider phone + email?

Date: 2026-06-28
Status: OPEN — needs Ken's decision
Raised by: AI coder (admin RBAC/data-integrity audit, this session)

## The plain-English question

When a support agent or admin opens a customer's or provider's detail page in the
admin console, should they see the person's **real phone number and email**, or a
**masked** version (e.g. `+63 9•• ••• ••12`, `j••@gmail.com`)?

Right now: **every admin role sees the raw phone and email** on the detail pages.

## Why this came up

The codebase has a written rule (in `packages/api/src/utils/pii-mask.ts`) that says:
only a **super admin** should see raw personal contact info; a **DPO** (data
protection officer) sees partly-masked; **everyone else** sees fully masked.

That rule is actually applied in some places (e.g. the activity/IP log), but the
main customer and provider **detail pages do not apply it** — they return and show
the raw phone + email to any admin. So the code contradicts its own stated rule.

This is not a security hole in the dangerous sense (these pages are admin-only and
the action endpoints are still role-gated). It is a **privacy-policy** question:
how much personal data should a regular support agent see by default.

## Where it is in code (for reference)

- API returns raw: `packages/api/src/services/customer-admin.service.ts` (getCustomerProfile, ~line 264) and the provider equivalent.
- UI shows raw: `apps/admin/src/pages/CustomerDetailPage.tsx` (~line 340), `apps/admin/src/pages/DisputeDetailPage.tsx` (~line 351).
- The masking helper that is NOT being used here: `packages/api/src/utils/pii-mask.ts`.

## Options

**Option A — Apply the masking rule to detail pages (most privacy-protective).**
Regular agents see masked phone/email; super admin (and optionally DPO) see raw,
ideally behind a "reveal" click that gets audit-logged. Matches the written rule
and NPC data-minimization expectations.
- Cost: a bit more work; agents sometimes need the real number to call a customer,
  so we'd add a logged "reveal" affordance for that.

**Option B — Officially exempt operational detail pages from the rule (simplest).**
Decide that admins running the marketplace legitimately need to see contact info to
do their job, and update `pii-mask.ts`'s doctrine comment to say the masking rule
applies to audit/log surfaces only, not operational detail pages. No behavior change.
- Cost: weaker privacy posture; should be defensible in our NPC registration.

**Option C — Middle ground.** Mask by default for non-super-admin, with a one-click
"reveal" that is audit-logged, AND keep raw for super_admin/DPO. (This is Option A
with the reveal built in from day one.)

## My recommendation

**Option C.** It honors the data-minimization rule we already wrote down, keeps
agents able to do their job (reveal-on-demand), and the audit log of reveals is
exactly the kind of record the NPC registration wants. It is more work than B but
it is the launch-safe answer for a platform handling Filipino consumers' PII.

I did **not** change any behavior here — this is a policy/compliance call for you.
Tell me A, B, or C and I'll implement it.

## Related (not blocking, noted from the same audit)

- There is no central "which roles can open which admin page" guard; gating is
  hand-written per page today (it works, but a future page could ship ungated).
  Low risk because the API enforces roles. I can add a small route-guard wrapper
  if you want defense-in-depth — say the word.
- The DPO role can currently *view* all operational pages. Tightening that to
  compliance pages only would pair naturally with the route-guard work above.
