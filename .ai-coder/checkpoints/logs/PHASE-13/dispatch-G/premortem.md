# Phase 13 Dispatch G — premortem (companion)

Companion to `gates/gate-3-premortem.md`. Same five scenarios, condensed.

1. **PayMongo webhook double-fire** — escrow state machine prevents
   double-credit; mutation tests on escrow.service cover the guard.
2. **DSR erasure during active booking** — FK ON DELETE RESTRICT;
   per-row tx ROLLBACKs; ops monitors error log.
3. **Wrong consent version published** — table is append-only by design;
   admin SOPs require peer review; superseding version available.
4. **BIGINT centavos > MAX_SAFE_INTEGER** — documented in
   LAUNCH-LIMITATIONS §15; trigger to migrate to BigInt at ₱9T platform GMV.
5. **Sentry quota exhausted in incident** — sample rate config; quota
   alerts at 75/90/100%; runbook in INFRA-CHECKLIST.
