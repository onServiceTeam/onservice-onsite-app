# Authorization register

**Status: DRAFT. Every row below is DRAFT until Ken confirms it.**
Prepared 2026-10-14 under D40 (`.ai-coder/decisions/D40-adopt-engineering-standard-v2.md`), as standard section C asks. Baseline: master `8d319a18`. Brought up to date on 2026-10-17 (row R2 status; no row's permission changed).

**What this file is.** One list of what Claude may do without asking, what needs Ken each time, and where each permission comes from.

**What this file is not.** It is not a lock. Nothing here is enforced by GitHub or by any tool:

- GitHub protection is off, by Ken's choice (D40 point 4, and row R7).
- Claude's tool setting lets almost every action run without a prompt (`.claude/settings.json:3-4`: `bypassPermissions`, `allow: ["*"]`, no deny list).

The rows work only because Claude follows them. A tool setting that allows everything does not give production, spending or cross-project authority (standard section B).

**Public repo.** This file holds no secrets, no server addresses and no credential locations. Where a source is private, it says "private records (not in the repo)".

**Line numbers.** A reference such as "old `CLAUDE.md:37`" is the line at `8d319a18`, before the D40 rewrite of `CLAUDE.md`. The current `CLAUDE.md` section is named next to it.

**"Uncertain" rows (R4 and R5) are not granted.** Claude does not act under them until Ken decides. R3 is different: it rests on Ken's own request of 2026-10-12, and only its end trigger is not set.

**Unknown scope means no permission for that one action. It never means stopping all other work.**

---

## Action classes

| Class | What Claude does |
|---|---|
| 1. Ordinary engineering | Goes ahead without asking, inside row R1 (and R6 for Expo modules). |
| 2. Runbook operations | Goes ahead only when every condition in the row holds, and records which row it used. |
| 3. Needs Ken each time | Prepares and checks the work, blocks only that step, writes a decision or escalation file, and keeps working on other ready items. Never invents the approval. See the Class 3 list below. |

## Summary

| ID | Action | Class | Source of authority | Status |
|---|---|---|---|---|
| R1 | Ordinary engineering in this repo | 1 | Ken 2026-05-01 (old `CLAUDE.md:37`) | DRAFT. Documented. |
| R2 | Release one exact commit to the tester server | 2 | Ken 2026-10-12 standing instruction (`CLAUDE.md` standing rule 1; Claude memory and private records) | DRAFT. Runbook written (`docs/runbooks/tester-server-release.md`), not yet used for a real release. |
| R3 | Keep the tester sign-in shortcuts Ken approved | 2 | Ken 2026-10-12 (`LAUNCH-LIMITATIONS.md:4149-4175`) | DRAFT. End trigger not set. |
| R4 | Read-only checks on the tester server | 2 | Current practice only | DRAFT. Uncertain: not granted until Ken decides. |
| R5 | Outage restart or app rollback on the tester server | 2 | One past one-off precedent only | DRAFT. Uncertain: not granted until Ken decides. |
| R6 | Add Expo's own free modules for the current SDK | 1 | Ken 2026-10-14 (D40 point 3) | DRAFT wording. Decision is Ken's. |
| R7 | GitHub protection stays off; say so everywhere | rule | Ken 2026-10-14 (D40 point 4) | DRAFT wording. Decision is Ken's. |

---

## R1. Ordinary engineering (class 1)

- **Allowed:** read, plan, edit, test, refactor and document. Write decision and escalation files. Add new entries to `LAUNCH-LIMITATIONS.md` (never remove one: old `CLAUDE.md:67`, now "What you must not do"). Commit. Push to master a commit whose local test suites pass. That direct push is how master moves today: CI and Gates run after the push and cannot block it. For a risky change, Claude may first run CI on a short-lived branch, then move master by a plain fast-forward to that exact commit once CI is green (`CLAUDE.md` "Branches and merging"; the 2026-10-14 repo alignment did this, `docs/operations/REPO-ALIGNMENT-2026-10-14.md:17`).
- **Resources:** this repository (the main checkout and its git worktrees), local test databases, local mock servers.
- **Environment:** Ken's PC and GitHub-hosted CI. Not the tester server.
- **Data:** seed or synthetic data only.
- **Largest allowed impact:** a commit that can be reverted. Never force-push master (old `CLAUDE.md:65`, now "What you must not do"). A red CI result means fix forward at once (`CLAUDE.md` "Branches and merging").
- **Spending:** ₱0.
- **Source:** Ken, 2026-05-01 (old `CLAUDE.md:37`: "You push directly to master"). Ken's standing request to work without repeated asking (private records, not in the repo). Standard section C.
- **Ends:** when Ken changes it.
- **Evidence required:** the CI and Gates run IDs on the exact commit, naming any gate that did not run. Today Gates B, D and E report green on master without running (Gates run `38555374447` on `8d319a18`).
- **Status:** Documented. DRAFT until Ken confirms.

## R2. Tester-server release (class 2, runbook)

- **Allowed:** release one exact master commit to the tester server, in this order:
  1. CI green on that exact commit, and the local full suites pass;
  2. a database backup before any change;
  3. only additive migrations, each rehearsed first on a restored copy;
  4. the API switched on with the exact-image and readiness check (`scripts/server/activate-api-release.sh`);
  5. new web files added beside the old ones, then the entry file switched;
  6. the catalog cache cleared;
  7. an APK with a strictly higher version number, inspected and published (`scripts/release/publish-android-apk.sh`).
- **Resources:** the onService app on the tester server only: its checkout, its API container, its database, its web files and its APK release folder. Not the shared web server, not the front door, and nothing that belongs to other businesses on the same host.
- **Environment:** the tester server. Never a real-customer production.
- **Data:** tester data stays on the server. Transcripts get counts and yes/no answers only. No row dumps of personal data.
- **Largest allowed impact:** one release, with the backup name and the previous app image recorded before the change so the app can be rolled back.
- **Spending:** ₱0.
- **Source:** Ken, 2026-10-12: keep his PC, GitHub and the live server in sync, with a new APK, in the same session (recorded in Claude memory outside the repo, and in private records). The private handoff limits it: it never covers pushing an unverified batch of changes onto live data. Under standard section V this rule is the approval for tester releases only.
- **Void if:** CI is not green on that commit; a rehearsal fails; a migration drops, renames or backfills data (old `CLAUDE.md:54`, now hard stop 2); a step needs a change to the shared web server or a compose change; real customers start using the server; or Ken revokes it.
- **Evidence required:** a release entry in the private worklog with the commit, image ID, backup name, rehearsal result, previous image and post-deploy checks.
- **Status:** The rule is in `CLAUDE.md` standing rule 1 (D40 change set); its limits are recorded here and in private records. Cleaned release scripts with fixture tests are in the D40 change set (`scripts/release/deploy-tester-release.sh`, `scripts/release/publish-web-builds.sh`), and so is the runbook they point to (`docs/runbooks/tester-server-release.md`: release states, post-deploy checklist, rollback and incident steps). None of them has been used for a real release yet, and rollback has never been practised. A CI job for their tests ("Release scripts - behaviour tests") is in the change set but has never run on GitHub; the full local Windows run on 2026-10-17 passed; the Linux-only file-mode checks have never run anywhere (updated 2026-10-17 evening; the earlier text said CI does not run their tests). Older scripts that were used are kept in private records. The one used for the `8d319a18` release was copied from a temporary session folder into the private records on 2026-10-17 (adoption backlog AD-08 in `STANDARD-V2-ADOPTION.md`). DRAFT until Ken confirms. (Updated 2026-10-17; the 2026-10-14 text said the runbook was not written yet.)

## R3. Tester sign-in shortcuts already approved (class 2)

- **Allowed:** keep in place, across releases, the shortcuts Ken asked for on 2026-10-12: admin sign-in by email and password only (`ADMIN_DISABLE_2FA=1`), the shared test code for allowlisted test numbers (`ALLOW_DEV_OTP`), and staging mode.
- **Not allowed:** any new bypass, extending a shortcut to a new kind of account, or carrying any of them into production.
- **Environment:** the tester server only.
- **Source:** Ken, 2026-10-12 (`LAUNCH-LIMITATIONS.md:4149-4163`, section 129).
- **Ends:** "Before a real launch" (`LAUNCH-LIMITATIONS.md:4174-4175`). No sharper trigger is set yet, for example the first real customer, the first real payment or the first real ID upload. Ken decides.
- **Status:** Documented. Rests on Ken's own request; only its end trigger is not set. DRAFT until Ken confirms.

## R4. Read-only checks on the tester server (class 2)

- **Allowed:** health and config endpoints, container logs, aggregate counts, file hashes.
- **Not allowed:** row dumps of personal data. Reading any secret file into the transcript.
- **Environment:** the tester server.
- **Source:** current practice, recorded in the private worklog. Never stated by Ken as a standing permission.
- **Status:** **Uncertain, so not granted.** Until Ken confirms, a live check happens only as part of an R2 release (its preflight and post-deploy checks). Outside a release, for example at a session restart, Claude takes the live commit from the newest private worklog entry instead of reading the server. DRAFT.

## R5. Outage restart or rollback (class 2)

- **Allowed:** restart the onService API container, or roll back to the recorded previous image and the old web entry file.
- **Not allowed:** any database restore without Ken. Releases never restore a live database or run down migrations automatically (`docs/runbooks/exact-api-release.md:102`).
- **Environment:** the tester server.
- **Source:** only one past one-off precedent (private records, not in the repo).
- **Status:** **Uncertain, so not granted.** Needs Ken's decision. DRAFT.

## R6. Expo's own free modules (class 1, with a record)

- **Allowed:** add Expo's own free modules for the current Expo SDK (SDK 55 today, `apps/mobile/package.json:23`), each recorded in a decision file. Keep the three added in Milestones 1 and 2: `expo-intent-launcher`, `expo-audio` and `expo-video` (`apps/mobile/package.json:35`, `:25`, `:43`).
- **Not allowed (Class 3):** anything from a new company, any paid service, and anything that sends data to a new place (old `CLAUDE.md:55`; now `CLAUDE.md` hard stop 3 and "New dependencies"). Every other new dependency also needs Ken first (`CLAUDE.md` "New dependencies").
- **Source:** Ken, 2026-10-14 (D40 point 3).
- **Evidence required:** the decision file, plus green mobile tests and CI on the commit that adds the module.
- **Status:** Decided by Ken in D40. This row's wording is DRAFT until Ken confirms it.

## R7. GitHub protection stays off (rule)

- **What it is:** master has no branch protection and no rulesets. Secret scanning, push protection, Dependabot alerts and Dependabot security updates are off. Ken keeps it this way for now.
- **What Claude must do:** say plainly in every project document that nothing is enforced by GitHub, and never claim a control is active. Claude does not switch any of these settings on or off (Class 3, item 5).
- **Source:** Ken, 2026-10-14 (D40 point 4).
- **Checked:** read-only on 2026-10-14. The branch protection API answers "Branch not protected" (404). Rulesets: none. Rules on master: none. Secret scanning, push protection and Dependabot security updates: "disabled". Dependabot alerts: 404 (off). The repo is public.
- **Ends:** when Ken switches the settings on. Even then, a setting counts as active only after a safe test shows it refuses a bad change (standard sections U and Z).
- **Status:** Decided by Ken in D40. This row's wording is DRAFT until Ken confirms it.

---

## Rules for every row

| Rule | Source |
|---|---|
| No real-money payment, refund or payout during tester use. | `LAUNCH-LIMITATIONS.md:4053-4060` |
| Never print secret values. Scripts that touch private files print only fixed messages or yes/no results. | `LAUNCH-LIMITATIONS.md:4165-4172` |
| Never run a delete command on an unchecked variable. Use literal, guarded paths. Check that a folder holds no links to other places before deleting it. | E08 (`.ai-coder/escalations/E08-accidental-rm-on-live-server-2026-06-10.md`); a local incident on 2026-10-14 (private records) |
| Never recreate or reload the shared web server, and never run `docker compose down`, on the tester server. A supervised reload needs Ken. | `LAUNCH-LIMITATIONS.md:4272`; private records |
| Never regenerate the Android signing key, and never copy it into the repo, the server, env files or build outputs. An owner-controlled off-machine backup is a Ken decision. | `docs/qa/NATIVE-BUILD-REQUIREMENTS.md:86-89` ("Do not regenerate it"); private records (where it may not be copied) |
| Never work around a denial, a hook or a permission prompt. | Standard section C; private records |
| Nothing private goes into this public repo: no secrets, server addresses, credential locations, private escalation contents or tester personal data. | D40; `docs/operations/REPO-ALIGNMENT-2026-10-14.md` |
| Stop a background runner by ending its whole process tree, then check it stopped. | Claude memory (outside the repo) |
| One active autonomous writer at a time. | Standard section J; private records |
| Tester data: counts and yes/no answers only in transcripts. No copies leave the server. | DRAFT envelope value: Ken to confirm |
| Spending started by Claude: ₱0. No new accounts or vendors. | DRAFT envelope value: Ken to confirm |

## Class 3: needs Ken each time

Claude prepares and checks the work, blocks only that step, writes it down, and keeps working on other items.

1. **Shared-host changes:** reloading or recreating the shared web server, `docker compose down`, the front door, anything that belongs to another business on the same host.
2. **Launch cutover:** production mode, removing the tester shortcuts, payment-provider go-live, DNS, and the `v1.0.0-launch-ready` tag (Ken applies it: `docs/runbooks/launch-cutover.md:10`, `:488`).
3. **Any real-money movement.**
4. **Destructive or data-rewriting live changes:** migrations that drop, rename or backfill data, backfills, deletes, and erasing tester data.
5. **Security and access:** GitHub protection, rulesets, visibility, secrets and environments; changing any credential; changes to `.claude` permission settings; new or extended sign-in bypasses; loosening or demoting a gate.
6. **New vendors, accounts or spending:** for example Resend, Firebase, Sentry, a Slack webhook, Google Cloud, a LiveKit server, Expo EAS, a Play Store listing.
7. **New external dependencies** (`CLAUDE.md` "New dependencies"), except Expo's own free modules under R6.
8. **Legal and customer commitments:** Terms, privacy notice, refund and cancellation policy, the guarantee (E10), the F#10 disclaimer, regulator filings.
9. **Publishing private escalations or private records.**
10. **Messages to testers, customers or providers on Ken's behalf.**
11. **Architecture decisions reserved for Ken** (old `CLAUDE.md:55`, now `CLAUDE.md` hard stop 3), and the open questions in D36, D38, E83 and E84.
12. **Resuming the Codex automation or starting any second autonomous writer.**

## Open questions for Ken about this register

1. Confirm or change each row R1 to R7.
2. Confirm the two envelope values: ₱0 spending started by Claude with no new accounts or vendors, and counts-only tester data.
3. Should R4 (read-only live checks) and R5 (outage restart or rollback) be standing permissions?
4. Set an end trigger for R3.
5. Say what Ken's older "make the recommended decision and continue" instruction covers (cited in `.ai-coder/decisions/D34-dpo-route-session-boundary.md:4`). Until Ken says, it is not read as covering money, architecture, dependencies or anything on the Class 3 list.
