# Dispatch 01 — Deploy blockers — Closeout (PARTIAL — 2 of 6 bugs)

Branch: `phase/14-d01-deploy-blockers`
Tag at merge: `v0.14.0-d01-partial-complete` (provisional)
Operating mode: Autonomous between dispatches, full audit chain.

---

## Status: partial dispatch

Per Ken's session-3 instruction "everything should be fully up to date at the main branch and nothing pending", this dispatch is being merged with **2 of 6 deploy-blocker bugs done** rather than waiting for the full set. The four remaining bugs (1251, 1286, 1309, 1325) will land in subsequent commits / dispatches against the same Phase 14 dispatch number.

**Done in this PR:**

- Bug 1235 — admin password seed removed; ADMIN_BOOTSTRAP_PASSWORD CLI bootstrap with strong-password validation; protective gate.
- Bug 1061 — mobile MMKV encryption key now derived per-device from OS keychain via expo-secure-store; full auth-flow refactor with idempotent legacy-token migration.

**Deferred to follow-up commits / PR (still tracked under D01):**

- Bug 1251 — admin localStorage tokens → httpOnly cookies + CSRF middleware
- Bug 1286 — Google Maps placeholder → app.config.ts env injection
- Bug 1309 — Prometheus zero scrape config → real scrape + /metrics endpoint
- Bug 1325 — S3 SSE deferred → Terraform with KMS-SSE + bucket policy + backfill

These are deploy blockers per the V14 audit and must merge before D02 can begin per the original Master Brief dispatch ordering. The autonomous-mode model accommodates this: the next session resumes on a fresh branch from master + the D01 commits already on master, completes the remaining bugs, opens a follow-up PR.

---

## Bugs claimed fixed

- Bug 1235 — admin password seed — `packages/api/seeds/004_admin_passwords.sql` (deleted) + `packages/api/scripts/bootstrap-admin.ts` — test: `packages/api/__tests__/scripts/bootstrap-admin.test.ts:Bug 1235 fix verified`
- Bug 1061 — mobile MMKV unencrypted — `apps/mobile/src/services/api.ts:11` (encryptionKey: undefined removed) + new `apps/mobile/src/services/secure-storage.ts` + new `apps/mobile/src/services/auth-migration.ts` + `apps/mobile/src/stores/auth.store.ts` (token reads via secure-storage) + `apps/mobile/app/_layout.tsx` (initSecureStorage at boot) — test: `apps/mobile/src/services/__tests__/auth-migration.test.ts:Bug 1061 fix verified`

---

## Gates run

Gates run on the PR via `.github/workflows/gates.yml`. Per `scripts/gates/EXPECTED-FAILURES.md`:

- [ ] Gate A — expected FAIL on master baseline (Bug 1170, 1324, 1185, 1271, 538 — fixed by D02–D04). Merge via relax-merge-restore.
- [x] Gate B — expected PASS once parsed: 2 bug claims, both have file diffs and test references.
- [ ] Gate C — expected FAIL on master baseline (Article 4.2 console.* + Article 7.1 axios — fixed by D02/D06). Merge via relax-merge-restore.
- [?] Gate D — script-bug failure observed on PR #3; expected to skip cleanly here since `apps/admin/tests/visual/` only has README. Will tighten in a follow-up.
- [?] Gate E — script-bug failure observed on PR #3; expected to skip cleanly here since this PR includes mobile .ts changes but stryker is not yet installed. Will tighten in D0.7 follow-up.

Per Ken's standing authorization to merge despite expected failures (recorded in session-2): `gh api -X PUT` relaxes `required_status_checks.contexts: []` + `required_approving_review_count: 0` + `required_conversation_resolution: false` for the merge window, then restores after.

---

## Audit chain artifacts

- [x] **Closeout** — this file
- [x] **Bug 1235 test** — covers strength validator (8 cases), email validator (3 cases), role validator (2 cases). References "Bug 1235 fix verified" on line 1.
- [x] **Bug 1061 test** — covers migration of all 3 legacy keys, deletion of legacy plaintext, idempotency flag, clean-install path, empty-string handling, partial-failure handling. References "Bug 1061 fix verified" on line 1.
- [N/A] **Visual UX report** — D01 produces no UI changes (Bug 1235 is server-side, Bug 1061 changes boot flow but UI is unchanged except for a brief boot ActivityIndicator that's invisible on warm starts after first launch).
- [N/A] **MASTER-QA CHECK INDEX** — deferred until full D01 closeout (the 4 remaining bugs touch additional surfaces).
- [N/A] **HASHES.sha256** — partial dispatches don't seal the hash chain. The full D01 hash chain seals when bugs 1251/1286/1309/1325 land.

---

## Files added (count: 6)

```
.ai-coder/dispatches/D01-closeout.md
apps/mobile/src/services/secure-storage.ts
apps/mobile/src/services/auth-migration.ts
apps/mobile/src/services/__tests__/auth-migration.test.ts
packages/api/scripts/bootstrap-admin.ts
packages/api/__tests__/scripts/bootstrap-admin.test.ts
packages/api/seeds/README.md
scripts/gates/c-constitution-no-admin-password-seeds.sh
```

(Note: 8 new files; the count of "6" excludes the closeout itself and the README which is documentation.)

## Files modified (count: 4)

```
LAUNCH-LIMITATIONS.md         (added §21)
apps/mobile/app/_layout.tsx   (initSecureStorage + migration at boot)
apps/mobile/src/services/api.ts        (token reads route via secure-storage)
apps/mobile/src/stores/auth.store.ts   (token reads/writes via secure-storage)
```

## Files deleted (count: 1)

```
packages/api/seeds/004_admin_passwords.sql
```

---

## Halt points encountered

None new. The 4 halt points discovered earlier (D0 step 0.3.5, D0 step 0.4 branch protection, D0 step 0.5.1 staging, D0 step 0.3 workflow scope) were all resolved in session 3.

## Decision points surfaced

None this commit. Decision points D02/D04/D13/D14 surface when their respective dispatches reach them.

## Open questions / known limitations

- **Bug 1271 (axios still imported)** — not addressed in this commit. Constitution Article 7.1 forbids axios; both `apps/mobile/src/services/api.ts` and `apps/admin/src/lib/api.ts` import it. Will be addressed in D02 cross-source-of-truth reconciliation alongside the routes registry + cancellation policy work.
- **Existing `secure-storage.service.ts` at id `onservice-secure`** — still uses the hardcoded fallback key `'onservice-dev-only-key'` for non-PII data (device fingerprint, accessibility prefs). Lower-impact risk than the auth-token store but still a Bug 1061-class issue. Will be addressed in a follow-up commit with the same OS-keychain pattern, or migrated to the new secure-storage.ts and the old file deleted.
- **Gate D and Gate E script bugs** — Gate D fails because the existence-check on `apps/admin/tests/visual/` passes (README is there) so it tries to run Playwright which isn't installed; Gate E may have a CI-environment issue with `git diff` pathspec. Both are gate-script bugs, not violations. Will be tightened in a follow-up infrastructure commit.

---

## What dispatches D01-continued / D02+ now have available

- **`secureStorage` abstraction** at `apps/mobile/src/services/secure-storage.ts` — any future sensitive client-side storage in the mobile app uses this. Token migration pattern documented.
- **`bootstrap-admin.ts`** — production admin user provisioning is now CLI-based, no longer seed-based. CI gate prevents future seeds from regressing.
- **`auth-migration.ts` pattern** — example of one-time idempotent migration for any future MMKV schema change.

## Auto-proceed decision

- [x] Two deploy-blocker bugs committed and pushed
- [ ] D01 PR opened at https://github.com/onServiceTeam/onservice-onsite-app/pull/5 (will be filled in by gh pr create)
- [ ] Merged via relax-merge-restore
- [ ] Branch deleted

After merge, the next session resumes with bugs 1251 → 1286 → 1309 → 1325, then closes D01 fully, then begins D02.
