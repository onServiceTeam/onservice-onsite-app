# Runbook — make KYC documents private (§35a)

> **Read first (findings 2026-06-04):**
> - Production currently has **0 KYC documents**, so there is **nothing to
>   migrate** — you can skip the "copy existing files" step (step 3) for now.
> - More urgent: the configured Space `onservice-uploads` is **not reachable**
>   with the current server credentials (NoSuchBucket). Until that's fixed, NO
>   uploads work in prod. Sort out the Space/credentials first (see
>   LAUNCH-LIMITATIONS item 36), then come back to this runbook.
> - New KYC uploads are now written **private-by-default** in code, so once the
>   Space is reachable + private, KYC docs are protected with no further work.
> - The app can serve KYC two ways (both shipped): a streaming proxy (default)
>   and short-lived signed links (`?mode=link`). Either works once the Space is
>   set up; you don't have to choose.

**Audience:** Ken (server/infra owner). **Time:** ~20–30 min. **Risk:** low if you
follow the order. **What it fixes:** government IDs, NBI clearances, and selfies
are currently stored in object storage and were handed out as direct links.
Anyone with a link could open the file. After this runbook, those files can only
be opened by the document's owner or an admin, through the app (logged in).

## What the code already does (shipped)

- KYC documents are now served only through authenticated API endpoints:
  - Provider viewing their own: `GET /api/v1/providers/me/kyc/:docType`
  - Admin reviewing a provider: `GET /api/v1/admin/providers/:id/kyc/:docType`
  - `:docType` is one of `government_id_front`, `government_id_back`,
    `nbi_clearance`, `selfie`.
- The API reads the file **server-side** with the server's own storage
  credentials and streams it back. The admin dashboard's "view" links now fetch
  through this path with the admin session.
- API responses **no longer contain the raw storage URL** for KYC files — only
  the protected proxy path.
- The server reads KYC files from the bucket named in `KYC_S3_BUCKET` (falls
  back to `S3_BUCKET` if that variable is not set).

The one thing code can't do for you: make the underlying storage **private** and
move the existing files. That's the steps below.

## Steps (do them in this order)

1. **Create a private bucket** (or reuse one), e.g. `onservice-kyc-private`.
   - Turn ON "Block all public access".
   - Keep default encryption ON (SSE-S3 / AES256, or SSE-KMS if you use a key).

2. **Give the API server read access** to that bucket. Use the same IAM
   user/role the app already uses for `S3_BUCKET`, and make sure its policy
   allows `s3:GetObject` (and `s3:PutObject` if new KYC uploads will write
   there) on `arn:aws:s3:::onservice-kyc-private/*`.

3. **Copy the existing KYC objects into the private bucket, keeping the same
   key paths.** The keys look like `identity/<userId>/<uuid>.jpg`,
   `onboarding/<userId>/<uuid>.jpg`, etc. Preserving the key is what lets the
   proxy find them. Example (run from a machine with AWS CLI + credentials):

   ```bash
   # Adjust prefixes to match where KYC was uploaded (identity/ and onboarding/).
   aws s3 cp s3://<CURRENT_BUCKET>/identity   s3://onservice-kyc-private/identity   --recursive
   aws s3 cp s3://<CURRENT_BUCKET>/onboarding s3://onservice-kyc-private/onboarding --recursive
   ```

   (If gov-ID/NBI/selfie were uploaded under a different prefix, copy that
   prefix instead. The key after the bucket name must stay identical.)

4. **Point the server at the private bucket.** On the server, add to the API
   `.env` (root-only file — you do this, I never touch it):

   ```
   KYC_S3_BUCKET=onservice-kyc-private
   ```

   Then restart the API:

   ```bash
   cd /opt/onservice
   docker compose -f docker-compose.prod.yml up -d api
   ```

5. **Verify it works (still readable through the app):**
   - Log into the admin dashboard → open a provider that has documents →
     Profile tab → click "view" on NBI / Government ID / Selfie. It should open
     the image in a new tab.

6. **Verify it's now private (old direct link is dead):**
   - Take one of the old direct file URLs (from the DB `providers` table, e.g.
     `nbi_clearance_url`) and open it in a browser while logged out. After the
     copy + block-public-access, it should return **403 / Access Denied**.

7. **(After you've confirmed everything works for a few days)** delete the KYC
   objects from the OLD bucket so the only copy is private. Keep a backup first.

## Notes

- New KYC uploads will continue to work; if you also set the app's write path to
  the private bucket later, tell me and I'll wire the upload context to write
  there directly. For now, run step 3 again periodically (or after onboarding a
  batch of providers) until that's done.
- The provider mobile app does not currently re-display a provider's own KYC
  files after submission, so there's nothing to break there. If we add a
  "review my documents" screen later, it will use `/providers/me/kyc/:docType`.
- This does not change anything about booking photos or other uploads — those
  stay on the existing public-serving path on purpose.
