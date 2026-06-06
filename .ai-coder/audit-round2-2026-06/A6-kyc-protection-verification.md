# A6 — KYC document protection (verification only)

**Date:** 2026-06-06
**Verdict:** PASS. KYC documents (government ID front/back, NBI clearance, selfie)
cannot be fetched unauthenticated or by an unauthorized user. No code change made.

## (1) The exact route/file that serves KYC documents

KYC docs are served ONLY through two authenticated API routes (no raw storage URL
is ever handed to a client):

- Owner: `GET /api/v1/providers/me/kyc/:docType`
  — `packages/api/src/routes/provider.routes.ts:989`
  (`authMiddleware` + `getProviderIdForUser(req.user.userId)` so a provider can
  only ever reach their OWN provider row).
- Admin: `GET /api/v1/admin/providers/:id/kyc/:docType`
  — `packages/api/src/routes/provider-admin.routes.ts:387`
  (`authMiddleware` + `requireAdmin(req)` → admin/super_admin/dpo only).

Both delegate to `kyc-document.service.ts`:
- `resolveAuthorizedKycValue()` (`kyc-document.service.ts:50`) loads the provider
  row and enforces `isAdmin || isOwner`, else throws 403.
- `getProviderKycDocumentStream()` streams the object server-side via
  `uploadService.getObjectStream()` (`upload.service.ts:362`) — the API reads the
  private object with its own credentials and pipes it; the client never receives
  a storage URL. Response headers set `Cache-Control: private, no-store`.

## (2) Guessable/public URL, or permission-checked + time-limited?

Permission-checked, not guessable:
- On upload, `context==='onboarding'` is stored with `visibility='private'`
  (`upload.routes.ts:77`). On S3 that means `ACL: private` + SSE (KMS or AES256) +
  `private, no-store` cache (`upload.service.ts:209-234`). On the local-FS backend
  (this staging box) the object lives under the `onboarding/` key prefix.
- API responses expose only the proxy path via `kycProxyPath()` (e.g.
  `/api/v1/providers/me/kyc/selfie`), never the raw object URL.
- The optional `?mode=link` path mints a SHORT-LIVED presigned URL
  (`getKycPresignedUrl`, clamped to 30–900s, default 120s, `upload.service.ts:411`)
  and only AFTER `resolveAuthorizedKycValue` has authorized the requester.
- `extractObjectKey()` strips path-traversal (`..`) and normalizes keys.

## (3) Is the infra step (LAUNCH-LIMITATIONS #35a) applied?

Yes, on the live staging server (5.78.143.185):
- `docker-compose.prod.yml` sets `S3_BUCKET: ""`, forcing the local-FS backend;
  KYC docs persist under the `uploads_data` volume in the `onboarding/` subtree.
- `nginx/nginx.conf` blocks the prefix: `location ^~ /uploads/onboarding/ { return 404; }`
  — so even the raw storage path is not publicly readable; only the authenticated
  API proxy can reach the bytes.

## Live probes (against https://api.onservice.ph, 2026-06-06)

| Request | Expected | Actual |
|---|---|---|
| `GET /uploads/onboarding/<uid>/test.jpg` | 404 (prefix blocked) | **404** |
| `GET /api/v1/providers/me/kyc/selfie` (no auth) | 401 | **401** |
| `GET /api/v1/admin/providers/<id>/kyc/selfie` (no auth) | 401 | **401** |

## Note for the production cutover

If the operator later moves uploads to a real S3/Spaces bucket (sets `S3_BUCKET`),
keep the KYC bucket PRIVATE (no public-read policy) and prefer `KYC_S3_BUCKET` as a
dedicated private bucket (see `docs/runbooks/kyc-private-bucket.md`). The code
already serves via the authenticated proxy / presigned URLs regardless of backend;
the bucket ACL is the remaining operator responsibility.
