# E40 — Privacy deadline wording and breach-notification classification need counsel

**Status:** OPEN — legal review required before changing the operative policy or
customer-facing promise

**Raised:** 2026-08-31

## Bad news

The product currently presents two legal conclusions more broadly than the
official NPC material supports:

1. Data-subject requests are described throughout the app and operations
   documentation as having an "NPC-required" 15-day fulfilment SLA. The official
   NPC material located during this audit describes 15 calendar days as the
   period after which a complainant may establish that the PIC/PIP did not take
   timely or appropriate action or did not respond. The source explicitly says
   this does not require a request to be granted or denied within that period.
2. Every row entered in `breach_log` immediately appears as an "NPC notice
   pending" case with a 72-hour clock. NPC Circular 16-03 applies mandatory
   notification when the breach meets the notification conditions, including
   the information involved, unauthorized acquisition, and likely real risk of
   serious harm. It also contemplates Commission-approved postponement or
   omission. The present schema has no recorded notification-requirement
   assessment, determination, legal basis, postponement, affected-data-subject
   notification evidence, or five-day follow-up-report tracking.

This is not a cosmetic copy issue. The admin workflow currently implies a legal
determination that the stored facts do not establish.

## Official sources checked

- NPC Circular 16-03, Personal Data Breach Management:
  https://privacy.gov.ph/wp-content/uploads/2022/01/sgd-npc-circular-16-03-personal-data-breach-management.pdf
- NPC breach-reporting guidance:
  https://privacy.gov.ph/pips-and-pics/breach-reporting/
- NPC FAQ on the 15-calendar-day complaint prerequisite:
  https://privacy.gov.ph/wp-content/uploads/2020/12/FAQs-on-the-proposed-2020-Rules-of-Procedure.pdf
- Data Privacy Act Implementing Rules and Regulations, Rule IX §38:
  https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/

## Current affected surfaces

- `packages/api/src/services/compliance.service.ts` creates every DSR with
  `due_at = NOW() + INTERVAL '15 days'`.
- `apps/admin/src/pages/DataProtectionLogPage.tsx` calls this the "15-day NPC
  SLA".
- `docs/strategy/COMPLIANCE.md`, `docs/operations/10-money-and-compliance-ops.md`,
  `docs/operations/11-admin-system-training-manual.md`, and architecture/audit
  records repeat the legal-window claim.
- `packages/api/src/services/breach-log.service.ts` starts a 72-hour timer for
  every incident and has only `npc_notified_at` / `npc_reference` as the
  notification outcome.
- `apps/admin/src/pages/BreachLogPage.tsx` labels every unnotified incident
  "NPC notice pending".

## Recommended product decision for counsel to approve

1. Keep 15 calendar days as an internal onService response target unless counsel
   selects another target, but stop calling it an NPC-mandated completion SLA.
   Add acknowledgement, identity-verification, extension, decision, and delivery
   timestamps so the record describes what actually happened.
2. Treat a new breach record as `notification_assessment = assessing`, not
   automatically reportable. Require an audited DPO determination of
   `required`, `not_required`, or `postponed_with_npc_approval`, with rationale,
   evidence, decision time, and decision maker.
3. Start the visible 72-hour mandatory-notification clock from knowledge of a
   breach that requires notification, while preserving discovery/knowledge
   timestamps and warning during assessment. Track NPC notice, affected-subject
   notice, receipt/confirmation, and the five-day follow-up report separately.
4. Preserve an intentionally conservative internal incident-response clock for
   all suspected incidents, but label it as internal triage until the legal
   determination is recorded.

## Why work pauses here

Choosing the statutory interpretation and customer promise is legal-language
work. Per `AGENTS.md`, code must not invent that policy. The current DPO/session
security boundary can be completed and verified without changing these claims,
but the breach-classification and DSR-deadline redesign must not be shipped until
qualified Philippine privacy counsel approves the policy above or supplies a
replacement.
