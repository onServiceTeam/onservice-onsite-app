# E52: Tester-feedback screenshots are publicly reachable

**Date:** 2026-09-01
**Status:** OPTION A APPROVED; code containment implemented on topic branch;
production inventory and deployment remain required
**Scope:** public tester-feedback upload, Admin Tester Feedback evidence, private exports, Nginx upload serving, existing stored screenshots

## Bad news

The public feedback form accepts screenshots of customer, provider, and admin
screens, but every accepted file is currently reachable without authentication.
The Admin Tester Feedback page is protected, but its screenshot thumbnails point
at the same public storage URLs, so knowing the URL bypasses the admin boundary.

The code path is explicit:

1. `POST /api/v1/feedback/upload` accepts an image and writes it beneath
   `uploads/feedback/` using a random UUID filename.
2. The route returns `https://<host>/uploads/feedback/<filename>` to the public
   form.
3. `legal/feedback.html` loads that URL directly for the upload preview and
   stores it in the submission payload.
4. Both Nginx vhosts route the generic `/uploads/` prefix to the uploads volume.
   The app vhost disables basic authentication for the prefix. Both vhosts send
   a 30-day `public, immutable` cache policy.
5. Admin detail and private exports preserve the direct URL.

UUID filenames reduce casual discovery but are bearer URLs, not authorization.
A tester can attach a screen containing names, addresses, booking details,
messages, payment context, or other personal data. The intake code does not
redact image pixels, expire the URL, or restrict who can retrieve it.

The local gitignored snapshot contains seven submissions and six referenced
screenshots. The prior production trace recorded ten submissions and six
screenshots. This audit does not claim that every stored image contains personal
data. It establishes that the storage and delivery path permits such data to be
publicly retrieved if the URL is known.

## Immediate containment until a decision is implemented

1. Do not publish, paste, or commit raw feedback screenshot URLs.
2. Do not delete, rename, or move the existing files. They are evidence and may
   be the only visual record for a tester report.
3. Do not change the Nginx prefix before the Admin page and private pull workflow
   can retrieve existing evidence through a replacement route.
4. Do not deploy the current topic branch. E32 already blocks production access,
   and E50/E51 separately block the branch from merge or deployment.

## Options

### Option A: authenticated evidence proxy plus public-prefix block, recommended

- Keep the existing files and database payloads intact.
- Add an authenticated Admin API route that validates the filename, verifies the
  referenced feedback record, and streams the file with `private, no-store`.
- Translate Admin screenshot links to that proxy rather than exposing storage
  URLs.
- Add a key-protected download route for the private AI-coder pull so the export
  key travels in a request header, not inside saved Markdown or screenshot URLs.
- Change the public form to preview the selected local `File` with an object URL
  while retaining the server-returned evidence identifier for submission.
- Add `location ^~ /uploads/feedback/ { return 404; }` before the generic uploads
  location in both Nginx vhosts.
- Inventory production rows and files, back up database/uploads/configuration,
  deploy API/Admin/form support first, validate old and new evidence through the
  proxy, then activate the Nginx block.
- Add a written retention and access-review policy as a separate privacy
  operations task. Do not silently delete historical evidence.

This preserves the current admin workflow and old evidence while removing the
unauthenticated path.

### Option B: super-admin-only or audited reveal

Use the same proxy and Nginx block, but restrict image retrieval to super_admin
or require an audited reveal event. This gives stronger least-privilege control
but prevents ordinary admins from independently reviewing screenshot-backed
reports unless a reveal workflow is built.

### Option C: keep public bearer URLs

Not recommended. Random filenames and upload validation do not make screenshots
private, and a 30-day public cache makes revocation less reliable.

## Decision

Ken approved **Option A** on 2026-09-01. Ordinary `admin` and `super_admin`
accounts may review screenshot evidence attached to a feedback record. Raw
storage paths are not an access mechanism. The private pull uses the export key
in the `x-feedback-key` request header. Evidence retention and periodic access
review remain separate privacy-operations work; this decision does not authorize
deletion or invent a retention period.

## Implemented code containment

- Bug UX-856 adds the authenticated, record-linked Admin screenshot proxy. It
  validates the feedback UUID and filename, verifies that the selected payload
  references the file, rejects symlinks/non-files, and returns `private,
  no-store` evidence.
- Bug UX-857 adds the private screenshot export route. All tester-data exports,
  including screenshot retrieval, accept the export secret only in
  `x-feedback-key`, never in the query string.
- Bug UX-858 removes direct storage paths from Admin image and full-size links.
- Bug UX-859 previews a newly selected browser `File` through a temporary object
  URL and revokes it after removal or submission. The server identifier is never
  loaded into an image element.
- Bug UX-860 adds explicit `/uploads/feedback/` 404 guards to both Nginx vhosts
  without changing ordinary public uploads.
- Bug UX-861 returns a relative storage identifier from upload intake, so an
  attacker-controlled Host header cannot become stored evidence metadata.
- Bug UX-862 makes the private pull send the export key in headers and retrieve
  screenshots through the protected route. The script reads the key only from
  its process environment rather than accepting a command-line secret.

Existing database payloads and files remain in place. Legacy absolute
`onservice.ph` and `onservice.com.ph` storage identifiers are translated by the
new retrieval paths, so no migration is required.

## Local verification

- The focused feedback API run passed 10 suites and 24 tests. The focused Admin
  feedback run passed 6 files and 8 rendered behavior tests.
- The full locally runnable API run passed 699 suites and 3,084 tests with one
  intentional suite/test skip. Both Docker-only Nginx suites were excluded from
  that aggregate and are not counted as passes.
- The full Admin run passed 259 files and 348 tests with one intentional file
  skip and three explicit todos.
- API/Admin TypeScript checks, API/Admin production builds, full repository
  ESLint, targeted ESLint, and `git diff --check` passed. The Admin build
  transformed 2,842 modules.
- Gate A passed all 10 blocking fragments, Gate C passed all 6 blocking
  articles, all 6 gate self-test groups passed, and the phantom-test scan found
  no forbidden pattern. The N+1 heuristic retained 31 reviewed locations and
  found no unjustified marker.
- The new Bug UX-860 executable Nginx test was attempted twice and did not pass
  locally because Docker could not start a container before the bounded timeout.
  It remains required on protected CI or a host with a responding Docker engine.

## Remaining production hard stop

Production is untouched. E32 still prevents the required live row/file
inventory and deployment. Before enabling the Nginx guard, follow
`docs/runbooks/tester-feedback-evidence-privacy.md`: inventory and back up the
database, upload volume, configuration, and deployed Git state; deploy the
API/Admin/form support first; prove old and new evidence works through protected
paths; then reload Nginx and prove direct evidence is 404 while ordinary uploads
still work. E50 and E51 separately prevent this topic branch from being merged
or deployed as a whole.
