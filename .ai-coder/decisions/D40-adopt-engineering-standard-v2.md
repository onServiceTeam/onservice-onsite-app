# D40: Adopt the Universal Autonomous Software Engineering Standard v2.0

**Date:** 2026-10-14
**Decided by:** Ken, answering four questions in the Claude Code session on 2026-10-14.
**Status:** DECIDED. Adoption is being carried out as its own reversible change set (see "How it is applied").

## What Ken decided

1. **Adopt the standard in full.** Ken chose "Yes, the full standard" over the lighter form Claude recommended. The standard is a proposed owner-adopted engineering policy (its own status line). It governs how the work is done. It does not override system or tool rules, the law, or the product requirements and safety limits already in this repo.
2. **Work order.** First fix the two bugs on the customer pay path that testers use now: R-CUS-09 (a false "finding a provider" message after paying an accepted quote) and R-NOT-01 (the chosen pro is never told the customer paid). Then do the adoption change set. Then work through the remaining P1 repair items in order. Every verified piece goes to GitHub, the live tester server and a new APK, the same session.
3. **App add-ons.** Keep the three Expo modules added during Milestones 1 and 2: expo-intent-launcher, expo-audio and expo-video. From now on Claude may add Expo's own free modules for the current SDK, recorded in a decision file. These still need Ken: anything from a new company, any paid service, and anything that sends data to a new place (CLAUDE.md hard stop 3).
4. **GitHub safety settings stay off for now.** Master has no branch protection or rulesets, and secret scanning and Dependabot alerts are off. Until Ken switches them on, every project document must say plainly that nothing is enforced by GitHub. No session may claim a control is active.

## Source material

- The standard as received (13 October 2026, sections A to Z) is kept in the private records. A public copy will live at `.ai-coder/governance/STANDARD-v2.md` once the adoption change set lands.
- The four companion files the standard refers to were never supplied: START_HERE.md, ADOPTION_AND_ENFORCEMENT.md, PLATFORM_PROFILES.md and SOURCES.md. Adoption follows section Z of the standard directly. No document may claim adoption "per START_HERE" or verification "per ADOPTION_AND_ENFORCEMENT", and the source references (S01 to S16) cannot be checked.
- Claude ran a read-only gap analysis on 2026-10-14. It used six readers and a synthesis, and covered every section against this repo at fa7fb079. It found 18 conflicts with current rules and recommended a 13-step change set. The full analysis is private because it names where credentials are stored.

## How it is applied (section Z)

- **Separate change set.** Governance changes go in their own commits: documents and workflow files only, no product code, and undoable with `git revert`. No gate is loosened. A gate change goes in its own commit with a test that proves it still rejects bad input.
- **Truth first.** Correct the claims that are false today:
  - branch protection "requires the 5 gates" (it is not installed);
  - fake-test patterns are "caught and rejected" (no check does this);
  - "all 5 gates green" (Gates B, D and E report green without running);
  - F#4 "validated against a live admin app" (it was validated locally).
- **CLAUDE.md** becomes the short entry file. It gets:
  - authority and precedence;
  - Ken's standing rules in a public-safe form;
  - review labels: self-review, agent review, Ken review, professional sign-off;
  - status words: Proposed, Implemented, Verified, Deployed, Production verified, Blocked;
  - risk tiers;
  - the rewritten hard-stop rule: block only the affected step and keep doing other ready work.
- **Older process documents** get a "historical" banner. Nothing is deleted. That covers the Phase 13 and 14 protocols, the old definition of done, .cursorrules and the Copilot instructions. CONSTITUTION.md's process sections need Ken's sign-off, because its own line 3 reserves edits to him.
- **Records:** an authorization register (every row marked DRAFT until Ken confirms it), one public-safe checkpoint, the release runbook and scripts kept in the repo, an honest CI summary job, and the full-standard records the gap analysis listed as backlog items. Those are a platform capability matrix, a data inventory, an integrations register, a threat model (private), release states and a post-deploy checklist.

## What this decision does not do

- It does not make anything enforced. GitHub protection is off by Ken's choice.
- It does not authorize spending, new vendors, production cutover, real-money movement, destructive migrations, or publishing private records.
- It does not change CLAUDE.md hard stops on money, data, legal wording or architecture.
- It does not declare the product launch-ready. 104 of the 124 repair items are still open as of 2026-10-14.
