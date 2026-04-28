# BASELINE-DEBT — PHASE-11

Generated: 2026-04-28T06:31:20Z

Pre-existing repository-wide violations as observed at the END of PHASE-11.
Each delta-aware gate reports both absolute and phase-introduced counts;
the gate passes when phase-introduced count is zero. Absolute counts
must trend toward zero across phases (Phase 02 is the primary cleanup
phase for forbidden patterns and emoji-as-icon).

## Per-gate absolute counts

- **gate-1-forbidden**: absolute=41, introduced-this-phase=0
- **gate-1-emoji**: absolute=0, introduced-this-phase=0
- **gate-1-phantom-tests**: absolute=0, introduced-this-phase=0
- **gate-5-n-plus-1**: absolute=25, introduced-this-phase=0

## Trend

Compare with prior phases' BASELINE-DEBT.md files in
`.ai-coder/checkpoints/logs/PHASE-*/BASELINE-DEBT.md` to verify counts
are non-increasing (and decreasing on cleanup phases).

## Deferred items

Each gate's full violation list is in `gates/<gate>.log`. The phase's
EVIDENCE-MANIFEST.md "Deferred to later phases" section names the
specific items by file/line and the phase scheduled to fix them.
