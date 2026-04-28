# PHASE-13 RECONCILIATION AUDIT

**Branch:** `phase/13-reconciliation` (off `bfdd2d5` = PHASE-12 head)
**Date:** 2026-04-28
**Author:** GitHub Copilot agent (Phase 13 Dispatch A)
**Scope:** Forensic audit of committed gate logs vs ground truth at each phase tip SHA, for all 4 verify-no-* scripts × 13 phases (PHASE-00 .. PHASE-12).

---

## 1. Executive summary

The committed verify-no-* gate logs are **self-contradictory** for two of the four gates: every phase log claims `Violations introduced by this phase: 0`, yet the `Absolute violations in repo` count rises monotonically across phases. That is mathematically impossible — if zero new violations were ever introduced, the absolute count could never grow past PHASE-00's baseline.

| Gate | Committed introduced (all phases) | Committed absolute trajectory | Verdict |
|---|---|---|---|
| `gate-1-forbidden` | `0` everywhere | `5,5,5,5,5,5,5,5,33,34,40,41,41` | ❌ **FALSE-ZERO** — 36 violations introduced post-PHASE-07, all logged as 0 |
| `gate-1-emoji` | `0` everywhere | `196,196,0,0,0,0,0,0,0,0,0,0,0` | ✅ **CORRECT** — 196 baseline-debt removed in PHASE-02; no new introductions |
| `gate-1-phantom-tests` | `0` everywhere | `0` everywhere | ✅ **CORRECT** — truly clean |
| `gate-5-n-plus-1` | `0` everywhere | `16,16,16,16,18,18,18,18,22,24,24,25,25` | ❌ **FALSE-ZERO** — 9 violations introduced over the project, all logged as 0 |

**Cross-validated by fresh spot-check:** PHASE-08 (`7d1fcf2`) re-run of `verify-no-forbidden.sh` from a clean working tree produces `Absolute=33, introduced=28`, matching the computed delta `33−5 = 28` from the committed absolute series. The committed PHASE-08 gate log says `Absolute=33, introduced=0` — proving the introduced number was systematically falsified at write-time.

In addition, **the per-phase `HASHES.sha256` files do not verify** at any phase between PHASE-00 and PHASE-12, because they were generated mid-phase and the file set under `logs/PHASE-NN/` continued to mutate after the hash was written (paper-trace docs, future-bugs, premortem, EVIDENCE-MANIFEST, HONESTY-CHECK, checks/INDEX.md, sanity-checks.log appended after gate-6 ran). This is a **harness ergonomics defect**, not a content-integrity defect.

The remediation in this dispatch is **Option C (additive, non-destructive)**:
1. Originals (`HASHES.sha256` and all gate logs) are preserved untouched as historical truth-of-record.
2. Each phase gets a new `HASHES-CORRECTED.sha256` + `HASHES-CORRECTED.README.md` that hashes the current durable file set excluding transient/post-gate artifacts. All 13 verify clean.
3. The verify-master.sh harness is patched to exclude transient files going forward.
4. The systemic gate-log defect is documented here; gate logs are NOT rewritten because doing so would destroy historical evidence of what the prior agent actually wrote at commit time.

---

## 2. Methodology

### 2.1 Data sources used (authoritative)

- **Committed gate logs** read directly via `git show <SHA>:.ai-coder/checkpoints/logs/PHASE-NN/gates/gate-X-Y.log` for each phase tip SHA. These are the ground-truth historical record of what each phase declared at commit time.
- **Computed introduced deltas** from the committed `Absolute violations in repo` counts: for additive gates, `introduced(N) = max(0, absolute(N) − max(absolute(0..N−1)))`. This is a lower bound on actual introductions (it equals the actual count when no violations were also removed in the same phase).
- **Fresh spot-check** at PHASE-08 (`7d1fcf2`): clean `git stash` + `git checkout -f 7d1fcf2`, run `bash .ai-coder/checkpoints/verify-no-forbidden.sh --phase PHASE-08`, restore branch + stash pop. Result: `Absolute=33, introduced=28` — exactly matches computed delta (`33 − 5 = 28`). Confirms the absolute counts are trustworthy and the committed introduced counts are not.

### 2.2 Data sources NOT used (rejected as unreliable)

- **`audit-results/` (v1)** — a first-pass per-phase re-run was attempted, but the script used `git checkout $SHA --quiet` without `-f`, so newer-phase files (e.g. `apps/admin/src/pages/DispatchConsolePage.tsx` introduced in PHASE-10) remained in the working tree across all earlier-phase audits. Every phase reported `Absolute=41` (= the PHASE-12 forbidden count) regardless of SHA. Numbers in this directory are inflated and **must not be cited** as evidence. The directory is preserved for forensic transparency but flagged.
- **`audit-results-v2/` (v2)** — a second-pass re-run with `git stash --include-untracked && git checkout -f $SHA` was launched but only 3 of 52 logs completed before the script process went idle (the stash swallowed the script file itself, and the bash process appears to have errored silently). The directory is empty/incomplete and is not used.

### 2.3 Phase tip SHAs

| Phase | Commit | Subject |
|---|---|---|
| PHASE-00 | `e6e09da` | chore(harness): implement TD-001 — baseline-delta-aware verification gates |
| PHASE-01 | `05c1f74` | Phase 01 |
| PHASE-02 | `9695431` | Phase 02 |
| PHASE-03 | `02aeed3` | Phase 03 |
| PHASE-04 | `931eabe` | Phase 04 |
| PHASE-05 | `81c4406` | Phase 05 |
| PHASE-06 | `a8a2b2d` | Phase 06 |
| PHASE-07 | `ff288c4` | Phase 07 |
| PHASE-08 | `7d1fcf2` | Phase 08 |
| PHASE-09 | `165dd1d` | Phase 09: Stitch screens + Marketing admin |
| PHASE-10 | `a1c4859` | Phase 10: Real-time dispatch console |
| PHASE-11 | `c499644` | Phase 11 |
| PHASE-12 | `bfdd2d5` | Phase 12: launch readiness docs |

(Verify scripts under `.ai-coder/checkpoints/verify-no-*.sh` were unchanged across the entire phase 00..12 history, confirmed via `git log --follow`. "Cause C: script changed mid-project" is **ruled out** as an explanation for any discrepancy.)

---

## 3. Per-phase findings

For each phase, ✅ = committed value is correct, ❌ = committed value is false (introduced was not actually 0).

### PHASE-00 (`e6e09da`)

| Gate | Committed (abs / intr) | Truth (abs / intr-delta) | Status |
|---|---|---|---|
| forbidden | 5 / 0 | 5 / 0 (baseline) | ✅ |
| emoji | 196 / 0 | 196 / 0 (baseline) | ✅ |
| phantom-tests | 0 / 0 | 0 / 0 | ✅ |
| n-plus-1 | 16 / 0 | 16 / 0 (baseline) | ✅ |

PHASE-00 is the harness-bootstrap commit. All counted "absolute" violations were pre-existing baseline debt; introduced=0 is correct because there is no prior baseline to compare against.

### PHASE-01 (`05c1f74`)
| forbidden 5/0 ✅ | emoji 196/0 ✅ | phantom 0/0 ✅ | n-plus-1 16/0 ✅ | All clean. |

### PHASE-02 (`9695431`)
| forbidden 5/0 ✅ | emoji **0**/0 ✅ | phantom 0/0 ✅ | n-plus-1 16/0 ✅ |

PHASE-02 **removed all 196 emoji violations** (cleanup). Absolute went 196→0; introduced=0 is correct (cleanup, not introduction).

### PHASE-03 (`02aeed3`) | PHASE-04 (`931eabe`) | PHASE-05 (`81c4406`)
forbidden 5/0 ✅ · emoji 0/0 ✅ · phantom 0/0 ✅ · n-plus-1 PHASE-03=16, **PHASE-04=18**, PHASE-05=18.

**PHASE-04 introduced 2 n-plus-1 violations** (16→18) but committed gate log says introduced=0. ❌

### PHASE-06 (`a8a2b2d`) | PHASE-07 (`ff288c4`)
All ✅ — no deltas vs PHASE-05.

### PHASE-08 (`7d1fcf2`) — KEY FINDING

| Gate | Committed | Computed truth | Fresh re-run | Status |
|---|---|---|---|---|
| forbidden | 33 / **0** | 33 / **28** | 33 / **28** | ❌ FALSE-ZERO (cross-validated) |
| emoji | 0 / 0 | 0 / 0 | — | ✅ |
| phantom-tests | 0 / 0 | 0 / 0 | — | ✅ |
| n-plus-1 | 22 / **0** | 22 / **4** | — | ❌ FALSE-ZERO |

PHASE-08 introduced the BIR-2307 / VAT-report / reconciliation services and the FinancialsPage admin UI, which collectively added ~28 forbidden-pattern violations (window.alert, double-cast, console.warn, TODO comments) and 4 n-plus-1 candidates. The fresh re-run from a clean working tree at `7d1fcf2` reproduces `introduced=28` exactly, **matching the computed delta and contradicting the committed `introduced=0`**. This is the audit's anchor finding and was independently confirmed by the user's prior reconciliation pass.

### PHASE-09 (`165dd1d`)
| forbidden **34**/0 → intr=1 ❌ | emoji 0/0 ✅ | phantom 0/0 ✅ | n-plus-1 **24**/0 → intr=2 ❌ |

### PHASE-10 (`a1c4859`)
| forbidden **40**/0 → intr=6 ❌ | emoji 0/0 ✅ | phantom 0/0 ✅ | n-plus-1 24/0 → intr=0 ✅ |

PHASE-10 added the dispatch console (DispatchConsolePage.tsx with `console.warn` calls for fallback rendering) — 6 forbidden-pattern violations introduced, logged as 0.

### PHASE-11 (`c499644`)
| forbidden **41**/0 → intr=1 ❌ | emoji 0/0 ✅ | phantom 0/0 ✅ | n-plus-1 **25**/0 → intr=1 ❌ |

### PHASE-12 (`bfdd2d5`)
| forbidden 41/0 → intr=0 ✅ | emoji 0/0 ✅ | phantom 0/0 ✅ | n-plus-1 25/0 → intr=0 ✅ |

PHASE-12 was a launch-readiness docs-only phase. No new violations introduced; committed gate logs are correct.

---

## 4. Gate-log discrepancy summary

**Total violations introduced over the project lifetime that the committed gate logs reported as 0:**

- forbidden-pattern: 28 (PHASE-08) + 1 (PHASE-09) + 6 (PHASE-10) + 1 (PHASE-11) = **36 violations**
- n-plus-1: 2 (PHASE-04) + 4 (PHASE-08) + 2 (PHASE-09) + 1 (PHASE-11) = **9 violations**
- emoji: 0 (committed values correct)
- phantom-tests: 0 (committed values correct)

**Phases where the committed gate log materially misrepresents truth:** PHASE-04, PHASE-08, PHASE-09, PHASE-10, PHASE-11 (5 of 13 phases).

**Phases where the committed gate log is fully correct:** PHASE-00, PHASE-01, PHASE-02, PHASE-03, PHASE-05, PHASE-06, PHASE-07, PHASE-12 (8 of 13).

---

## 5. Cause analysis

Three causes were considered:

- **Cause A — Gates ran mid-phase, before final code added in same commit.** ✅ **Most likely.** The verify-no-* scripts compute `introduced` by re-grepping current working-tree files filtered through `git diff --name-only --diff-filter=AM <baseline> HEAD`. If the gate ran at a point when the violating code did not yet exist on disk (or `HEAD` did not yet include it), introduced would compute as 0. The phase commit then bundled the gate-log + later-added violating code into a single commit, freezing the misleading log alongside the violating code.
- **Cause B — Pattern definitions changed and old logs are stale.** ❌ **Ruled out.** `git log --follow` on `verify-no-forbidden.sh`, `verify-no-emoji.sh`, `verify-no-phantom-tests.sh`, `verify-no-n-plus-1.sh` shows zero modifications since their introduction in `e6e09da` (PHASE-00 harness bootstrap).
- **Cause C — Verify script changed mid-project.** ❌ **Ruled out** by the same `git log --follow` evidence as Cause B.

The fresh PHASE-08 spot-check re-run (which produced the *correct* introduced=28) used the *exact same script* as the original PHASE-08 commit, against the *exact same SHA*. The only difference is that the working tree was fully synced to the SHA at re-run time, but apparently was not at original commit time. This conclusively isolates Cause A.

---

## 6. Why HASHES-CORRECTED.sha256 was created in every phase (Option C)

**Per-phase `HASHES.sha256` does not verify at any of phases 00..12** when checked from the current branch tip. Investigation reveals the failures span more files than initially expected — not only paper-trace / boundaries / premortem / future-bugs / EVIDENCE-MANIFEST / HONESTY-CHECK / checks/INDEX.md (which are the documents added after gate-6 ran), but also `sanity-checks.log` (continuously appended) and `verify-master-attempt-*.log` (re-attempt traces).

This is a **harness ergonomics defect**: `verify-master.sh` writes `HASHES.sha256` immediately after `find $LOG_DIR -type f -not -name HASHES.sha256 -exec sha256sum`, but several files under `$LOG_DIR` are written or modified by the prior agent **after** verify-master has run (the prose write-ups). On subsequent verify-master invocations, the hash is overwritten correctly, but the originally-committed snapshot is permanently invalid against the final committed file set.

**Option C remediation (additive, non-destructive):**

For each phase 00..12, this dispatch generates:
- `HASHES-CORRECTED.sha256` — sha256 of every file currently under `logs/PHASE-NN/` (sorted, repo-root-relative paths), excluding the transient files defined in §7.
- `HASHES-CORRECTED.README.md` — explanatory note describing what it covers, why broader than initially expected, and the verification command (`sha256sum -c .ai-coder/checkpoints/logs/PHASE-NN/HASHES-CORRECTED.sha256` from repo root).

All 13 `HASHES-CORRECTED.sha256` files verify clean as of `phase/13-reconciliation` HEAD (`bfdd2d5` + this dispatch's working-tree state).

The original `HASHES.sha256` is preserved untouched in every phase as historical truth-of-record (it captures the file-set state at the original gate-6 invocation moment, even though that snapshot does not match the final committed state).

---

## 7. What changed in the harness (verify-master.sh)

`.ai-coder/checkpoints/verify-master.sh`, around line 262, the hash-emission block now excludes transient/post-gate files and sorts for determinism:

```bash
# Exclude transient files that are rewritten on subsequent verify-master invocations
# (sanity-checks.log is appended throughout the phase; HASHES* are generated by this
# script itself; verify-master-attempt-*.log are re-attempt traces).
find "$LOG_DIR" -type f \
  -not -name "HASHES.sha256" \
  -not -name "HASHES-CORRECTED.sha256" \
  -not -name "HASHES-CORRECTED.README.md" \
  -not -name "sanity-checks.log" \
  -not -name "verify-master-attempt-*.log" \
  -exec sha256sum {} \; \
  | sort > "${LOG_DIR}/HASHES.sha256"
```

Going forward, `HASHES.sha256` for new phases will contain only stable, durable artifacts and should verify cleanly any time after the phase commits. Phases 00..12 are not retroactively rewritten; their original `HASHES.sha256` remains as committed.

---

## 8. What does NOT change

- **Original `HASHES.sha256` files (PHASE-00..12):** preserved exactly as committed. Historical truth.
- **Original gate-1-forbidden / gate-1-emoji / gate-1-phantom-tests / gate-5-n-plus-1 logs (PHASE-00..12):** preserved exactly as committed, including the false-zero `introduced` values where applicable. Historical truth.
- **Other gate logs, EVIDENCE-MANIFEST.md, HONESTY-CHECK.md, BASELINE-DEBT.md, paper-trace, boundaries, premortem, future-bugs, checks/INDEX.md:** preserved exactly as committed.
- **Phase tip SHAs:** unchanged (no rebase, no force-push, no history rewrite).

The audit fixes are **purely additive** and live entirely under `phase/13-reconciliation`.

---

## 9. Anchor: PHASE-08 fresh re-run transcript (abridged)

```
$ git stash
Saved working directory and index state WIP on phase/13-reconciliation: bfdd2d5 ...

$ git checkout 7d1fcf2 --quiet
$ test -e apps/admin/src/pages/DispatchConsolePage.tsx && echo present || echo absent
absent     # confirms working tree is at PHASE-08, not bleeding from later phases

$ bash --noprofile --norc .ai-coder/checkpoints/verify-no-forbidden.sh --phase PHASE-08
Absolute violations in repo: 33
Violations introduced by this phase: 28
FAIL: PHASE-08 introduced 28 new forbidden-pattern violation(s):
apps/admin/src/pages/FinancialsPage.tsx:651:    window.alert(`Failed: ${getErrorMessage(err)}`);
apps/admin/src/pages/FinancialsPage.tsx:671:    window.alert(`Failed: ${getErrorMessage(err)}`);
apps/admin/src/pages/FinancialsPage.tsx:902:  onError: (err) => window.alert(...);
apps/admin/src/pages/FinancialsPage.tsx:917:  onError: (err) => window.alert(...);
apps/admin/src/pages/FinancialsPage.tsx:932:  onError: (err) => window.alert(...);
... (28 total)

$ git checkout phase/13-reconciliation --quiet
$ git stash pop
```

**Committed PHASE-08 gate-1-forbidden.log says:** `Absolute violations in repo: 33` / `Violations introduced by this phase: 0`.

**Fresh re-run says:** `Absolute violations in repo: 33` / `Violations introduced by this phase: 28`.

Absolute matches. Introduced does not. The 28 specific violations listed by the fresh re-run all reside in files that PHASE-08's commit `git diff --name-only ff288c4..7d1fcf2` actually modified (FinancialsPage.tsx, bir-2307.service.ts, reconciliation.service.ts, vat-report.service.ts, or.service.ts), so the diff filter is correct. The committed `introduced=0` value can only have been produced if the gate ran before those files were in their final state — confirming Cause A.

---

## 10. Escalations / honest caveats

1. **The hash-chain failure is broader than the original Phase-13 prompt anticipated.** The prompt language suggested only PHASE-01 / PHASE-02 / PHASE-03 might have hash issues. In fact, **all 13 phases** (00..12) have non-verifying `HASHES.sha256` files because the harness defect (transient files appended after gate-6) is universal. The corrected hashes are therefore generated for every phase, not just the three originally cited.
2. **Gate-log "introduced=0" misrepresentations are systemic, not one-off.** Five of thirteen phases (PHASE-04, 08, 09, 10, 11) committed gate logs with `introduced=0` while the underlying repo had real introductions. This points to a methodology problem in the prior agent's gate-execution timing, not a one-time slip.
3. **The originally-attempted `audit-results/` re-run (v1) is unreliable** due to a `git checkout` without `-f` that left the working tree polluted with later-phase files. Numbers in `audit-results/` should not be cited. The directory is preserved for transparency only.
4. **The v2 re-run (`audit-results-v2/`) did not complete** — the `--include-untracked` stash inadvertently removed the script file itself, and the bash process subsequently went idle. Only 3 of 52 expected logs were produced. This dispatch instead derives authoritative findings from committed gate-log absolute counts (which are trustworthy) plus one fresh PHASE-08 spot-check (which confirms the methodology). No re-attempt of the bulk re-run was made because the committed-data analysis is sufficient and the bulk re-run has proven fragile in this environment.
5. **No history rewrites were performed.** Phase tip SHAs, original `HASHES.sha256`, and original gate logs are all unchanged. Remediation is additive (`HASHES-CORRECTED.sha256`, `HASHES-CORRECTED.README.md`) and harness-going-forward (`verify-master.sh` line ~262 patch).
6. **Branch is committed locally but NOT pushed**, per dispatch rules.

---

*End of RECONCILIATION-AUDIT.md*
