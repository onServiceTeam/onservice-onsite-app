# Contributing to onService

This repo is governed by the AI-coder phase plan in `.ai-coder/`.
Human contributors and AI agents follow the same conventions.

## Branch strategy

- `main` — protected. Only fast-forward merges from
  release / hardening branches via PR after a green
  `verify-master.sh` run.
- `phase/NN-<slug>` — one branch per phase (e.g.
  `phase/13-reconciliation`). All work for a phase lands on this
  branch via signed commits, with periodic merges back into `main`
  after the phase's verification gate is green.
- `dispatch/NN-<letter>-<slug>` — short-lived sub-task branches
  forked off a phase branch (e.g.
  `dispatch/13-f-doc-restructure`). Squash-merge back into the
  parent phase branch.
- `fix/<short-slug>` — out-of-band bug fixes. Always branch from
  `main`, PR back into `main`.

Direct commits to `main` are forbidden.

## Commit message convention

Every commit MUST start with the phase prefix in lower-case:

```
phase-NN(<dispatch>.<step>): short imperative summary

Optional longer description with bullet points covering:
- what changed
- why it changed
- any follow-up tickets or LAUNCH-LIMITATIONS entries
```

Examples:

```
phase-13(f.10a): aria-label sweep for filter inputs
phase-13(f.11e): root README/LICENSE/CONTRIBUTING/CHANGELOG
phase-08(b.3): generate sequential OR PDFs via pdfkit
```

For out-of-band fixes use `fix(<area>): summary` instead.

## PR checklist

Before opening a PR, confirm every box:

- [ ] Branch is up to date with `main` (rebased, not merged).
- [ ] All commits follow the prefix convention above.
- [ ] `npm run typecheck --workspaces --if-present` is green.
- [ ] `npm run lint` (root) is green.
- [ ] `npm run test --workspace=packages/api` is green for any API
      change, including new or amended tests.
- [ ] `bash .ai-coder/checkpoints/verify-master.sh PHASE-NN` is
      green for the current phase, OR the failures are documented
      in the PR description with a remediation plan.
- [ ] No new `any`, `@ts-ignore`, `as unknown as X`, `console.log`,
      or `TODO` lines (the forbidden-patterns gate enforces this).
- [ ] No new emoji used as iconography (the no-emoji gate enforces
      this; lucide-react icons only in admin, equivalents in
      mobile).
- [ ] `LAUNCH-LIMITATIONS.md` updated if the change introduces or
      removes an intentional v1 caveat.
- [ ] `CHANGELOG.md` updated if the change is user-visible.
- [ ] Documentation in `docs/` updated if the change touches a
      spec, runbook, or contract.
- [ ] PR description names the reviewer(s) and links the relevant
      phase plan in `.ai-coder/phases/`.

## Style notes

- TypeScript strict mode everywhere. Never widen with `as` to bypass
  a real error — fix the type.
- Money values in the database are BIGINT centavos and surfaced to
  JS as `Number` via the pg-types parser. See
  [docs/MONEY-HANDLING.md](docs/MONEY-HANDLING.md).
- Admin uses Sonner toasts. Never use `window.alert` or
  `window.confirm` in admin code.
- Audit-log writes belong in their own try/catch with
  `logger.warn('msg', { err: String(err) })`.
- Filenames in PR descriptions and commit messages should use the
  workspace-relative path (no drive letters, no `file://`).

## Reporting issues

Internal issues live in the phase plans under `.ai-coder/phases/`.
Bugs found during QA review go in
`.ai-coder/checkpoints/logs/PHASE-NN/bugs/` using the template at
`.ai-coder/templates/BUG-REPORT-TEMPLATE.md`.

Security issues must NOT be filed in public trackers. Email the
onService Team directly.
