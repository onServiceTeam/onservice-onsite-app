# Audit 2026-05-01 — REOPENED — Coverage gap honest accounting

**Status:** Audit was prematurely closed at ~53% line-by-line coverage. User pushed back. Reopening to reach 100%.

## Honest line counts (regenerated 2026-05-02)

Total source/config codebase: **146,236 lines** across **925 files** (excludes lock files).

| Area | Files | Lines |
|---|---:|---:|
| packages/api | 344 | 68,099 |
| apps/mobile | 399 | 50,845 |
| apps/admin | 130 | 23,976 |
| scripts | 45 | 2,837 |
| infra | 7 | 479 |
| **TOTAL** | **925** | **146,236** |

By extension:
- ts: 385 files, 74,516 lines
- tsx: 291 files, 60,249 lines
- sql: 81 files, 4,230 lines
- yaml/yml: 90 files, 3,241 lines
- sh: 42 files, 2,533 lines
- js, json, md: 36 files, 1,467 lines

## What was line-by-line read in Phases A-G (~77,400 lines)

| Phase | Area | Lines |
|---|---|---:|
| B | Money path (escrow, wallet, commission, payment, booking pricing, parts of routes) | 13,599 |
| C | Auth + RBAC + sessions | 6,075 |
| D | Customer mobile (43 screens + supporting) | 18,979 |
| E | Provider mobile (41 screens + supporting) | 14,031 |
| F | Admin web (29 pages + 21 UI components) | 21,111 |
| G | 18 of 81 migrations | 2,400 |
| H | 8 representative test files spot-read | 1,200 |
| **Subtotal** | | **~77,400** |

**Coverage so far: 77,400 / 146,236 = 52.9%**

## What's NOT yet line-by-line read (~68,800 lines)

This is the gap to close. Phases J-O will close it.

### Phase J — Remaining migrations (63 of 81, ~1,830 lines)
SQL is highest stakes per line. 22% read, 78% unread. Includes:
- 008, 010, 011, 012, 013, 014_create_disputes, 015, 016, 017, 018, 019, 020, 021, 022, 023, 024, 025, 027, 028, 029, 030, 031, 032, 033, 034, 035, 036, 037, 038, 039, 040, 041, 042, 043, 044, 045, 046, 047, 048, 049, 051, 052, 053, 054, 055, 056, 058, 072, 073, 075, 076, 077, 078, 079, 081, 083, 084, 086 — and any 089+ I find.

### Phase K — Mobile shared src/ + mocks + remaining screens (~14,000 lines)
- apps/mobile/src/ (107 files, 10,039 lines) — shared utilities/hooks/components
- apps/mobile/__mocks__/ (15 files, 363 lines)
- Re-cover any customer/provider screen files I marked "read" but actually only sampled
- apps/mobile/app/_layout.tsx (119), index.tsx (86), onboarding.tsx (206), auth/* (426), provider-onboarding/* (2,087), (tabs)/* (1,683), (provider-tabs)/* (1,477)

### Phase L — Admin shared (non-page) source (~1,800 lines)
- apps/admin/src/components/ (25 files, 1,159 lines) — partially sampled in F07; do full read
- apps/admin/src/lib/ (4 files, 378 lines)
- apps/admin/src/stores/ (66), App.tsx (87), main.tsx (49), hooks (41), config (10), vite-env.d.ts (15), vitest.setup.ts (122)

### Phase M — API support layer (~3,500 lines)
- packages/api/src/middleware/ (10 files, 500 lines)
- packages/api/src/validators/ (21 files, 795 lines)
- packages/api/src/utils/ (7 files, 653 lines)
- packages/api/src/jobs/ (2 files, 580 lines)
- packages/api/src/config/ (5 files, 304 lines)
- packages/api/src/types/ (7 files, 286 lines)
- packages/api/src/server.ts (291)
- packages/api/src/seeds/ (43)
- packages/api/src/models/ (37)

### Phase N — Remaining API services + routes (~30,000 lines)
- packages/api/src/services/ (63 files, 28,925 total): money-path subset (~12k) was read in Phase B. Need to identify and fully read the other ~17k (provider services, admin services, notification services, marketing, support, analytics, etc.)
- packages/api/src/routes/ (41 files, 11,089 total): partially read in Phases B/C/F. Need to identify and fully read remaining (~6k).

### Phase O — Tests + scripts + infra + maestro (~12,500 lines)
- 218 test files were classified by signature only; 8 spot-read. Remaining 210 are 1,200 of source already in audit; the test BEHAVIOR was not fully read. Bucket-classification stands but actual test reading needs to happen for the 74 REAL-UNIT bucket files (~9k lines).
- packages/api/scripts/ (~280 lines)
- scripts/ (45 files, 2,837 lines)
- apps/mobile/.maestro/ (84 YAMLs, 2,834 lines)
- infra/ (7 files, 479 lines)
- apps/admin/tests/visual/ (30 files, 2,511 lines) — already partially noted in F#4

### Phase P — Synthesis at 100%
Re-issue audit closeout with:
- Updated CRIT/MED counts including new findings from J-O
- Updated dispatch list with any new P0/P1/P2 added
- Final per-area coverage table at 100%
- Production-readiness checklist update

## Honest expected outcomes

- **Best case:** Phases J-O reveal ~10-30 additional CRITs (mostly in untouched migrations + API support layer + mobile shared) and ~80-150 additional MEDs.
- **Worst case (more likely):** Phases J-O reveal larger numbers because the remaining 47% includes the riskiest unread surface: untouched migrations (which can corrupt data), middleware (which gates everything), and shared mobile utilities (which power 84 screens).
- **Either way:** I will not close the audit again until 100% coverage is reached.

## Discipline rules for Phases J-O

1. Every file marked "read" gets its full path + line range fully covered (not "read first 100"). If a file is too large to fully read in one tool call, split into multiple Read calls until 100% covered.
2. Each phase ends with a `PHASE-X-SUMMARY-AND-HANDOFF.md` listing exactly which files were fully read, with line counts, and what was found.
3. The Phase I-B dispatch list gets ADDITIONS, not rewrites. Each new CRIT-NNN gets appended.
4. No file gets a "spot read" claim. Either it's fully read or it's not, and the inventory tracks the exact line range covered.

## Estimated phase sizing (so user knows what to expect)

| Phase | Lines | Honest # of Read tool calls |
|---|---:|---:|
| J | ~1,830 | ~10-15 (migrations are small) |
| K | ~14,000 | ~50-70 |
| L | ~1,800 | ~10-15 |
| M | ~3,500 | ~20-30 |
| N | ~30,000 | ~100-150 |
| O | ~12,500 | ~50-80 |
| **Total** | **~63,600** | **~240-360 Read calls** |

This is multiple sessions of work. I'll begin now and continue until done. If I hit context limits I'll write a handoff and the next session continues exactly where this leaves off. No more premature closures.

---

Starting Phase J now.
