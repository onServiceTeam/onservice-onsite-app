#!/usr/bin/env bash
# Phase 14 Dispatch 04 — superseded by c-constitution-no-shield-references.sh.
#
# This file is now a thin alias that delegates to the stricter Gate C
# constitution check. It exists so historical workflow references and
# lazy muscle-memory `bash scripts/gates/a-cross-source-no-siguradoshield.sh`
# invocations still work, but the actual logic and allowlist live in the
# new gate.
#
# Background: the old REPORT-only fragment scanned for SiguradoShield
# references in apps/ + packages/ but tolerated them as REPORT until D04
# landed. Per Ken's Option A pull (.ai-coder/decisions/D04-siguradoshield.md),
# D04 promoted the gate to BLOCKING with a stricter scope (UI surfaces +
# charge/payout code; ALL code paths in apps/ and packages/) and a
# documented allowlist for legitimate references in spec docs, the decision
# file, deprecated migrations, and LAUNCH-LIMITATIONS.
#
# MODES.json marks this fragment as BLOCKING and references the new gate
# for actual enforcement.

set -euo pipefail
GATES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$GATES_DIR/c-constitution-no-shield-references.sh" "$@"
