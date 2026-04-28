# Phase 13 Dispatch G — future-bugs (companion)

Companion to `gates/gate-3-future-bugs.md`. Same top-3, condensed.

1. **CORS allowlist drift** — env vars APP_URL and ALLOWED_ORIGINS
   must move in lockstep; documented in INFRA-CHECKLIST and both
   .env.example files; 4 cors-allowlist tests.
2. **Migration 059 lock timeout in prod** — 37 ALTERs in one
   migration; INFRA-CHECKLIST documents off-peak run with `SET
   lock_timeout='30s'`; partial failure leaves clear cut-points.
3. **Doc tree restructure breaks deep links** — Notion/Slack/GitHub
   pinned links to old root paths now 404; README.md points to
   canonical locations; git mv preserves history; redirects file
   deferred.
