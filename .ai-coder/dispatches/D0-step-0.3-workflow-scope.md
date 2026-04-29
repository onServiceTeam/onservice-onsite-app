# Dispatch 0 Step 0.3 — CI workflow OAuth scope (halt point 4)

## What happened

While committing Dispatch 0 the AI coder attempted to push `.github/workflows/gates.yml` to origin. GitHub rejected the push:

```
! [remote rejected] phase/14-d0-prerequisites -> phase/14-d0-prerequisites
  (refusing to allow an OAuth App to create or update workflow
  `.github/workflows/gates.yml` without `workflow` scope)
```

The `gh` CLI on this machine is authenticated with token scopes `gist`, `read:org`, `repo` — but **not** `workflow`. GitHub blocks any non-`workflow`-scoped push that creates or modifies files under `.github/workflows/`. This is a security feature, not a bug.

## Resolution required from Ken

The 4th D0 halt point: Ken either grants the `workflow` scope to the AI coder's gh-cli token, or manually creates the workflow file via the GitHub UI.

### Option A (recommended) — refresh gh CLI auth with workflow scope

Run on the AI coder's machine (or Ken's, then share token):

```bash
gh auth refresh -s workflow
```

After this, push the workflow file as a follow-up commit:

```bash
git checkout phase/14-d0-prerequisites
git add .github/workflows/gates.yml
git commit -m "ci: install gates workflow per Phase 14 Part 4"
git push
```

The workflow file is preserved in the working tree at `.github/workflows/gates.yml` — its content is the canonical Part 4 spec, copied verbatim from `.ai-coder/phase-14/PART-4-GATE-HARDENING-REFERENCE.md` §"CI workflow integration."

### Option B — manual upload via GitHub UI

If granting the `workflow` scope is undesirable for security reasons, Ken can:

1. Open https://github.com/onServiceTeam/onservice-onsite-app on `phase/14-d0-prerequisites` branch.
2. Navigate to `.github/workflows/`.
3. Click "Add file → Create new file" with name `gates.yml`.
4. Paste the content from the local `.github/workflows/gates.yml` file (preserved in the working tree of the bootstrap branch — Ken can `git show phase/14-d0-prerequisites:.github/workflows/gates.yml` to retrieve it, or open the file in his editor on the local repo where the AI coder created it).
5. Commit directly to `phase/14-d0-prerequisites` via the UI.

After either option, the D0 PR will have the gates workflow installed and CI runs will trigger on subsequent PRs.

## Why this is halt point 4 and not a hard stop

The 5 hard stops in `AUTONOMOUS-EXECUTION-PROTOCOL.md` are:

1. verify-master.sh exits non-zero after 3 fix attempts
2. Architectural decision required
3. Money or compliance risk
4. Production data risk
5. Spec contradiction

This is none of those. It's an environmental constraint: the `gh` CLI token doesn't have a scope. The fix is mechanical, not architectural. The AI coder continues forward progress (begins D01 from D0 HEAD locally) while this scope refresh waits for Ken; when Ken refreshes, the workflow lands and CI activates retroactively for all in-flight PRs.

## Workflow file contents reference

The complete workflow file content is in the working tree at `.github/workflows/gates.yml` (untracked but present). It runs all 5 gates (A through E) on every PR targeting master and every push to `phase/**` branches, with `gates-summary` depending on all 5.

Per Part 4 §"CI workflow integration", required status checks for branch protection should include: `gate-a`, `gate-b`, `gate-c`, `gate-d`, `gate-e`, `gates-summary`.
