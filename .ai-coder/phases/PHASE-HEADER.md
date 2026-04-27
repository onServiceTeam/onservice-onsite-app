# PHASE HEADER — read before every phase

This header is referenced from every phase document. Read it before starting any phase work.

## The After-Every-Change Ritual (mandatory, not optional)

After every meaningful change you make in this phase — adding a component, endpoint, migration, fix, dependency, refactor of >50 lines, test, or contract change — STOP and run the following ritual literally:

> **You are acting as a senior full-stack engineer, QA lead, and data integrity auditor. Perform a progressive sanity and integrity check on the changes just made.**
>
> **1️⃣ SANITY CHECK:**
> - Verify all new UI elements are wired and functional
> - Ensure no hardcoded or placeholder data was introduced
> - Check new backend logic is reachable and invoked
> - Verify data flows correctly for the changed parts
> - List issues found and fix immediately
> - Check contract alignment
> - Runtime
> - Build
> - Todos
> - Migrations
> - Contracts
> - buttons, clicks, forms, submits, reads, writes, edits, updates, create. Check every piece and option. Calendars, schedules, date and time selections, etc.
> - leave nothing unchecked and unverified for each page. Follow the code, follow what its supposed to do, follow what it connects to. Check fully if this makes sense or if something is missing or broken or going to throw an error or behave wrong
> - Inconsistencies with wiring, accuracy, connections and linkage to other things
> - pre-existing errors and failures from other phases and builds should be fixed too
> - Fix errors even if they do not pertain to this build. leave nothing unturned
> - fix any cosmetic issues even if minor and even if there is not any functional impact
> - fix anything pre-existing that can be fixed anywhere too, even if it's not related to this build or phase or prompt and also ensure it's all working and aligned here and with everything else too in this system
>
> **2️⃣ FEATURE INTEGRITY CHECK:**
> - Perform end-to-end check of the feature
> - Verify UI → Backend → Database → UI flow
> - Ensure edge cases and error states are handled
> - Detect any dead UI, unused backend logic, or hardcoded values
> - Provide a gap analysis and fix all issues
>
> **3️⃣ SYSTEM REGRESSION CHECK:**
> - Check that new changes did not break existing functionality
> - Verify data contracts remain consistent
> - Ensure UI and backend expectations still align
> - List regressions, risks, and fixes
> - Apply all corrections
>
> Do not skip any of the above. Only include unrelated parts if they are affected by these changes. Provide all issues found, exact fixes, and confirm that everything works end-to-end for this feature batch.

## Important: don't rabbit-hole

The instruction "fix anything pre-existing" is real, but it's bounded by these rules:

- **Small + obvious + self-contained fix?** → Fix it now (typos, missing handlers, console.logs, missing alt text, broken imports, etc.)
- **Architectural fix needed?** → STOP. Write to `.ai-coder/checkpoints/logs/escalations/ESC-<date>.md`, ask Ken.
- **Large fix (>50 lines or >3 files), not on the critical path?** → Log to `.ai-coder/checkpoints/logs/tech-debt.md`. Do not silently expand the phase.

The point: **never silently leave a broken thing broken**, AND **never silently rabbit-hole into unbounded refactors.**

## Logging the result

After each ritual, append a structured entry to `.ai-coder/checkpoints/logs/PHASE-NN/sanity-checks.log` per the format in `.ai-coder/CONTINUOUS-SANITY-CHECK.md`. The number of entries must be roughly proportional to the number of meaningful changes in your diff. `verify-master.sh` checks this at end of phase.

## End-of-phase, in addition

After all the work is done and the after-every-change rituals have all been performed, you ALSO run:

1. The 6 gates from `100-PERCENT-ACCURACY-PROTOCOL.md`
2. The applicable subset of the 463 checks from `MASTER-QA-SYSTEM.md`
3. `bash .ai-coder/checkpoints/verify-master.sh PHASE-NN`

Then and only then can you report to Ken.
