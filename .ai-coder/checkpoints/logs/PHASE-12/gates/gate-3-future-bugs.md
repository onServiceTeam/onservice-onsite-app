# Phase 12 — Future Bugs / Known Gaps

Items intentionally NOT fixed in Phase 12. Each is documented with reason,
estimated effort, and recommended next phase.

## SEC-004 — Government-ID encryption at rest (S3 SSE)

- **State**: `packages/api/src/services/upload.service.ts` calls
  `PutObjectCommand` without a `ServerSideEncryption` parameter. Bucket-level
  default encryption (set in AWS S3 / DO Spaces console) is currently the
  only line of defence.
- **Fix sketch**: Add `ServerSideEncryption: 'AES256'` to the
  `PutObjectCommand` params (or `'aws:kms'` + `SSEKMSKeyId` if a KMS key is
  provisioned). One-line code change plus a regression test that snapshots
  the params.
- **Why deferred**: The audit wants the explicit-in-code control, but a
  bucket-level default policy already provides at-rest protection in
  practice. Fix in a security hardening sprint with the matching infra
  change so the two are reviewed together.
- **Estimated LOC**: <10.

## SEC-005 — PII masking in logs

- **State**: `packages/api/src/utils/logger.ts` is a vanilla winston logger.
  No PII redaction formatter; emails, phones, tokens, and passwords flow
  through unmodified if a caller logs them.
- **Fix sketch**: Add a winston format that recursively walks each log
  payload object and replaces values for keys matching
  `/email|phone|password|token|secret|otp|apiKey/i` with `[REDACTED]`. Wire
  the format ahead of `winston.format.json()`. Add unit tests.
- **Why deferred**: Estimated 50-80 LOC plus a per-call-site sweep to
  validate that no log lines are accidentally relying on the unredacted
  shape. Exceeds the Phase 12 scope rule (>50 LOC).
- **Estimated LOC**: 80-120.

## SEC-009 — Admin CSP headers

- **State**: `apps/admin/index.html` has no
  `<meta http-equiv="Content-Security-Policy">` tag.
  `apps/admin/vite.config.ts` has no `server.headers` entry. No `vercel.json`
  with edge headers is in the repo.
- **Fix sketch**: The simplest path is `apps/admin/vercel.json` with a
  `headers` entry serving a CSP like
  `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.onservice.ph https://*.sentry.io;`
  for production. Tighten further with nonces once inline-script audit is
  complete. Vite dev server needs the CSP relaxed for HMR.
- **Why deferred**: Doable in <30 LOC, but requires an audit of every inline
  script and style currently emitted by the React/Vite/Tailwind build, plus
  a coordinated Sentry / PayMongo / map-tile origin allowlist. Better as its
  own focused PR.
- **Estimated LOC**: 30 + audit time.

## Other observations (not SEC-tracked)

- The Phase 12 smoke test asserts that every `*admin*.routes.ts` file
  references `authMiddleware|requireAdmin|requireSuperAdmin`. It does NOT
  assert that every individual route registration uses the middleware. A
  future Phase could add an AST-based test that enumerates each `router.get`
  / `router.post` and asserts the middleware is in the chain.
- `JWT_SECRET` rotation is undocumented. Rotating it invalidates every
  active session (access + refresh) — operationally painful. A
  dual-secret rolling rotation scheme (`JWT_SECRET_PREVIOUS` accepted for
  verify only, new tokens signed with `JWT_SECRET_CURRENT`) would be a
  worthwhile future enhancement.
