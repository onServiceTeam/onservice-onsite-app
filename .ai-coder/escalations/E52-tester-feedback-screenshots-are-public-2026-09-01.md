# E52: Tester-feedback screenshots are publicly reachable

**Date:** 2026-09-01
**Status:** OPEN: privacy containment decision and production inventory required
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

## Decision required

Approve Option A, or choose the stricter Option B. The recommendation is Option
A now, followed by a separate evidence-retention and audited-access review. It
removes public access without destroying evidence or blocking the existing
company triage workflow.

## Work paused

This is a personal-data access risk and a production-facing evidence change.
Per `AGENTS.md`, implementation, merge, and deployment pause at this point until
Ken approves the access model. Production remains untouched.
