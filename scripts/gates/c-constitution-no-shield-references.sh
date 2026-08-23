#!/usr/bin/env bash
# Phase 14 Dispatch 04 — Stricter SiguradoShield gate (BLOCKING).
#
# Replaces the REPORT-only `a-cross-source-no-siguradoshield.sh` fragment.
# Per Ken's pull-execution rule (.ai-coder/decisions/D04-siguradoshield.md
# Option A, 2026-04-30): no commit may reintroduce SiguradoShield to UI
# surfaces or to charge/payout code paths.
#
# Banned patterns (case-insensitive):
#   - SiguradoShield (literal trademark)
#   - siguradoShield* / siguradoshield* (constants / setting keys)
#   - propertyDamageCoverage / propertyDamageDeductible (insurance-shaped)
#   - premiumProtection / shieldDeductible
#   - max_property_damage_coverage / max_theft_coverage / max_injury_coverage
#     / claim_window_hours / damage_deductible_* / auto_suspend_claim_count
#     / provider_recovery_rate (DB setting keys for the deferred product)
#
# Allowlist (paths where the term may legitimately appear):
#   - LAUNCH-LIMITATIONS.md
#   - .ai-coder/decisions/D04-siguradoshield.md
#   - .ai-coder/phase-14/** (read-only spec docs)
#   - .ai-coder/dispatches/D04-* (closeout / plan reference the term)
#   - scripts/gates/c-constitution-no-shield-references.sh (this file)
#   - scripts/gates/a-cross-source-no-siguradoshield.sh (alias)
#   - scripts/gates/MODES.json
#   - scripts/gates/EXPECTED-FAILURES.md
#   - scripts/gates/__tests__/ (smoke tests reference the term in negative assertions)
#   - packages/api/migrations/*.sql (deprecated migrations preserve history)
#   - docs/strategy/INSURANCE.md
#   - docs/audits/** (Phase 13 audit docs)
#   - docs/LEGAL-REVIEW-2026-06-05.md (legal removal record)
#   - docs/operations/01-company-foundation.md (operator warning against reintroduction)
#   - docs/strategy/CEBU-LAUNCH-PLAN.md (shelved-product strategy record)
#   - docs/REPO-INTEGRATION.md
#   - .ai-coder/audit-2026-05-01/** (immutable historical audit evidence)
#   - .ai-coder/escalations/E10-customer-fees-and-service-guarantee-2026-06-28.md
#     (active legal-language hard-stop evidence)
#   - .ai-coder/SESSION-LOG.md
#   - .ai-coder/CURRENT-DISPATCH (during D04 in-flight; cleared after merge)
#   - .ai-coder/dispatches/D03-closeout.md (D03 referenced the upcoming D04 work)
#   - .ai-coder/dispatches/D01-final-closeout.md (historical mention)
#   - .ai-coder/dispatches/D0-closeout.md (historical mention)
#   - .ai-coder/dispatches/D02-final-closeout.md (historical mention)
#   - .ai-coder/checkpoints/** (Phase 13 mutation logs)
#   - .ai-coder/PHASE-14-ACKNOWLEDGMENT.md
#   - .ai-coder/PHASE-14-REMEDIATION-MASTER-INSTRUCTION.md (post-D14
#     audit doc; "What's verified solid" section names D04 by full
#     trademark when listing dispatches that pass code-level review)
#   - .ai-coder/EXECUTION-DISCIPLINE.md
#   - .ai-coder/phases/** (older phase docs)
#   - .ai-coder/templates/** (templates may reference)
#   - CLAUDE.md
#
# Anything NOT in the allowlist that mentions the banned patterns FAILS this gate.

set -euo pipefail

PATTERN="SiguradoShield|siguradoShield[A-Za-z_]*|siguradoshield[a-z_]*|propertyDamageCoverage|propertyDamageDeductible|premiumProtection|shieldDeductible|max_property_damage_coverage|max_theft_coverage|max_injury_coverage|claim_window_hours|damage_deductible_threshold|damage_deductible_amount|auto_suspend_claim_count|provider_recovery_rate"

# Find every match across the repo, then filter out allowlisted paths.
hits=$(grep -rEn -i \
  --include="*.ts" --include="*.tsx" \
  --include="*.js" --include="*.jsx" \
  --include="*.json" \
  --include="*.md" \
  --include="*.sql" \
  --include="*.yml" --include="*.yaml" \
  --include="*.sh" \
  -e "$PATTERN" \
  apps/ packages/ scripts/ docs/ .ai-coder/ \
  ./CLAUDE.md ./LAUNCH-LIMITATIONS.md ./README.md 2>/dev/null \
  || true)

if [ -z "$hits" ]; then
  echo "Gate C — no-shield-references [BLOCKING]: OK"
  exit 0
fi

# Step 1 — strip lines that are comments. The gate's intent is to block
# actual code references and visible-to-user copy. Comments documenting
# why SiguradoShield was REMOVED are legitimate (and necessary, so future
# AI coders / humans don't accidentally reintroduce it). A line is a
# comment if, after the file:line: prefix, the first non-whitespace
# content begins with one of: //, /*, *, {/*, --, #
hits=$(echo "$hits" | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|/\*|\*[^/]|\{/\*|--|#)')

if [ -z "$hits" ]; then
  echo "Gate C — no-shield-references [BLOCKING]: OK (only deprecation comments reference the term)"
  exit 0
fi

# Step 2 — apply path allowlist
filtered=$(echo "$hits" | grep -vE \
  -e "^\.?/?LAUNCH-LIMITATIONS\.md:" \
  -e "^\.?/?\.ai-coder/decisions/D04-siguradoshield\.md:" \
  -e "^\.?/?\.ai-coder/phase-14/" \
  -e "^\.?/?\.ai-coder/dispatches/D04-" \
  -e "^\.?/?\.ai-coder/dispatches/D14r-" \
  -e "^\.?/?\.ai-coder/dispatches/D03-closeout\.md:" \
  -e "^\.?/?\.ai-coder/dispatches/D02-final-closeout\.md:" \
  -e "^\.?/?\.ai-coder/dispatches/D01-final-closeout\.md:" \
  -e "^\.?/?\.ai-coder/dispatches/D0-closeout\.md:" \
  -e "^\.?/?scripts/gates/c-constitution-no-shield-references\.sh:" \
  -e "^\.?/?scripts/gates/a-cross-source-no-siguradoshield\.sh:" \
  -e "^\.?/?scripts/gates/MODES\.json:" \
  -e "^\.?/?scripts/gates/EXPECTED-FAILURES\.md:" \
  -e "^\.?/?scripts/gates/__tests__/" \
  -e "^\.?/?packages/api/migrations/.*\.sql:" \
  -e "^\.?/?docs/strategy/INSURANCE\.md:" \
  -e "^\.?/?docs/audits/" \
  -e "^\.?/?docs/LEGAL-REVIEW-2026-06-05\.md:" \
  -e "^\.?/?docs/operations/01-company-foundation\.md:" \
  -e "^\.?/?docs/strategy/CEBU-LAUNCH-PLAN\.md:" \
  -e "^\.?/?docs/REPO-INTEGRATION\.md:" \
  -e "^\.?/?docs/architecture/" \
  -e "^\.?/?docs/strategy/STRATEGIC-DECISIONS-LOG\.md:" \
  -e "^\.?/?docs/strategy/STRATEGY\.md:" \
  -e "^\.?/?docs/strategy/COMPLIANCE\.md:" \
  -e "^\.?/?\.ai-coder/SESSION-LOG\.md:" \
  -e "^\.?/?\.ai-coder/audit-2026-05-01/" \
  -e "^\.?/?\.ai-coder/escalations/E10-customer-fees-and-service-guarantee-2026-06-28\.md:" \
  -e "^\.?/?\.ai-coder/CURRENT-DISPATCH:" \
  -e "^\.?/?\.ai-coder/checkpoints/" \
  -e "^\.?/?\.ai-coder/PHASE-14-ACKNOWLEDGMENT\.md:" \
  -e "^\.?/?\.ai-coder/PHASE-14-REMEDIATION-MASTER-INSTRUCTION\.md:" \
  -e "^\.?/?\.ai-coder/EXECUTION-DISCIPLINE\.md:" \
  -e "^\.?/?\.ai-coder/phases/" \
  -e "^\.?/?\.ai-coder/templates/" \
  -e "^\.?/?CLAUDE\.md:" \
  -e "^\.?/?apps/[^/]+/__tests__/" \
  -e "^\.?/?apps/[^/]+/.*\.test\.tsx?:" \
  -e "^\.?/?packages/[^/]+/__tests__/" \
  -e "^\.?/?packages/[^/]+/.*\.test\.tsx?:" \
  || true)

if [ -z "$filtered" ]; then
  echo "Gate C — no-shield-references [BLOCKING]: OK (all matches in allowlist)"
  exit 0
fi

echo "Gate C VIOLATION (no-shield-references) [BLOCKING]:"
echo "Phase 14 D04 (Ken Option A — pull) prohibits SiguradoShield in UI surfaces"
echo "and charge/payout code paths. The following are outside the allowlist:"
echo ""
echo "$filtered" | head -30
echo ""
echo "If this is a legitimate new reference (rare), add the path to the gate's"
echo "allowlist with a comment explaining why, OR file an exception via"
echo ".ai-coder/governance/GATE-AMENDMENTS.md."
exit 1
