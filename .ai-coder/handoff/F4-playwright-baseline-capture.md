# F4 Handoff — Admin Playwright visual baseline capture

**Status:** scaffolded (29 spec files committed) → awaiting baseline capture against a running admin app.
**Owner after handoff:** Ken / contractor / CI on hosted runner with Chromium.
**Estimated time:** 1-2 operator-hours.
**Estimated cost:** Free (your laptop is enough — Playwright runs in headless Chromium).

---

## What's already done (no action needed)

- 29 Playwright spec files committed under `apps/admin/tests/visual/<page-slug>.spec.ts`, one per admin page in `apps/admin/src/pages/`.
- Each spec exercises 4 states (default/loading/empty/error) at 3 viewport widths (1280, 1440, 1920) = **12 screenshots per page** = **348 total screenshots** when fully captured.
- API mocks via `page.route('**/api/v1/admin/**', ...)` are wired so each spec triggers the right state without needing a fixture-loaded backend.
- The existing `apps/admin/playwright.config.ts` is already set up (baseURL points at `localhost:5173` or `STAGING_ADMIN_URL`).
- **Generator script** (`scripts/dev/generate-playwright-specs.py`) so the scaffolding can be regenerated when new admin pages land.

The specs compile and run against Playwright as-is. What's missing is the captured baseline PNGs.

---

## Prerequisites

1. **Playwright installed:**
   ```bash
   cd apps/admin
   pnpm install
   pnpm exec playwright install chromium
   ```

2. **Admin app running locally OR a staging URL exported.** Two options:

   **Option A — local admin app:**
   ```bash
   bash scripts/dev/up.sh        # API + Postgres + Redis
   pnpm --filter @onservice/admin dev    # Vite at localhost:5173
   ```

   **Option B — hosted staging:**
   ```bash
   export STAGING_ADMIN_URL=https://admin.staging.onservice.ph
   ```

3. **Test super-admin account logged in** (the spec assumes already-authenticated session storage). Either:
   - Hand-log-in once via the admin UI, then copy session storage into a `playwright/.auth/admin.json` fixture, OR
   - Add a global setup script `apps/admin/playwright.global-setup.ts` that POSTs to `/api/v1/auth/admin/login` with test creds and stores the JWT in `localStorage`.

   The current scaffold assumes "already authenticated"; if the page redirects to login on every spec, wire global-setup.

4. **Git LFS configured:**
   ```bash
   git lfs install
   git lfs track "apps/admin/tests/visual/baselines/**/*.png"
   git add .gitattributes
   ```

---

## Capture procedure

### 1. Capture all baselines

```bash
cd apps/admin
pnpm exec playwright test tests/visual --update-snapshots
```

Expected output:
- 29 spec files × 12 screenshots each = up to 348 PNGs
- All written under `apps/admin/tests/visual/<page-slug>.spec.ts-snapshots/` (Playwright's default snapshot location).

If a spec fails (e.g., page doesn't exist, route mismatch, auth redirect), Playwright reports it. Fix the mismatch (route or auth) and re-run with `--update-snapshots`.

### 2. Review the baselines

Open the snapshots directory:
```bash
ls apps/admin/tests/visual/*-snapshots/
```

Visually inspect each. Reject any with rendering bugs (clipped text, unexpected modal, wrong route loaded). Re-run the spec after fixing the page.

### 3. Commit + push

```bash
git add apps/admin/tests/visual/*-snapshots/
git status   # verify LFS pointer files
git commit -m "test(r4): Playwright visual baselines for 29 admin pages (4 states × 3 viewports)"
git push
```

### 4. Promote Gate D for admin

Edit `scripts/gates/MODES.json` `gate_d_state` rationale to mention admin baselines have landed. Once both R3 (mobile baselines) and R4 (admin baselines) have landed, flip `gate_d_state.mode` to `"BLOCKING"`:

```json
"gate_d_state": {
  "mode": "BLOCKING",
  "owning_dispatch": "D14r-3+D14r-4",
  "promoted_in": "D14r-4-baselines",
  "rationale": "Promoted to BLOCKING after F#3 (84 mobile flows) + F#4 (29 admin specs) baselines were captured. Gate D now compares each PR's screenshot output against these baselines and fails on visual regression."
}
```

### 5. Tag

```bash
git tag -a v0.14.1-remediation-4 -m "R4 — Playwright visual baselines captured"
git push origin v0.14.1-remediation-4
```

---

## CI integration

Once baselines are captured + pushed, the existing Gate D in `scripts/gates/d-visual-screenshots.sh` already invokes:

```bash
pushd apps/admin > /dev/null
pnpm exec playwright test tests/visual/ --update-snapshots=missing
popd > /dev/null
```

The `--update-snapshots=missing` flag means CI can capture missing baselines automatically the first time a new spec is added. Existing baselines are diffed strictly.

For CI to run Playwright, the workflow needs:
- `apps/admin` workspace deps installed (`npm ci --legacy-peer-deps` already does this from R2 fix)
- `pnpm exec playwright install chromium` step
- The admin app served (either via Vite dev server in CI, or a pre-built static bundle on a port)

If the CI step is missing, add it to `.github/workflows/ci.yml` under a new `admin-visual` job that depends on `admin-check`.

---

## What `v0.14.1-remediation-4` represents when tagged

- 29 Playwright spec files committed.
- Up to 348 baseline PNGs committed via LFS (or fewer if you only do default state for v1.0).
- Gate D promoted to BLOCKING (combined with R3).
- Future PRs that change admin UI render output get caught by visual diff.

Without baseline capture, the spec files still serve as documentation — but the gate stays REPORT.

---

## Hosted-runner alternative (if no local Vite is convenient)

GitHub Actions can run Playwright headless against a deploy preview:

```yaml
- name: Capture Playwright baselines (admin)
  run: |
    cd apps/admin
    pnpm install
    pnpm exec playwright install chromium
    STAGING_ADMIN_URL=${{ secrets.STAGING_ADMIN_URL }} \
      pnpm exec playwright test tests/visual --update-snapshots
- name: Commit baselines
  run: |
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
    git add apps/admin/tests/visual/*-snapshots/
    git diff --cached --quiet || git commit -m "ci: refresh Playwright baselines"
    git push
```

This is appropriate if the admin app already has a hosted preview environment that Playwright can hit. Otherwise the local capture is faster.
