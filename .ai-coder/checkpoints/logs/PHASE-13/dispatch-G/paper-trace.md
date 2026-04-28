# Phase 13 Dispatch G — paper-trace (companion)

This file is the dispatch-G companion to
`gates/gate-2-paper-trace-phase-13.md`. Same flows; condensed format
focusing on Phase 13's net-new code paths only. The gate-level file is
the one verify-master inspects.

## Flows

1. **DSR submission** → mobile UI POST → service.submitRequest →
   audit_log insert (try/catch + winston warn) → notifications insert
   → response. Admin UI lists via GET → marks complete via POST →
   admin_actions insert → user notification.

2. **Consent version publish** → admin UI POST → service.publishConsentVersion
   → consent_versions INSERT (append-only) → admin_actions INSERT.

3. **BIGINT money** → process startup pg.types.setTypeParser(20, Number)
   → all subsequent SELECTs return BIGINT columns as JS Number → service
   arithmetic in Number → JSON response.

4. **scrypt verify-with-rehash** → /login POST → SELECT password_hash →
   parse format (modern N=131072 / modern lower-N / legacy 2-part) →
   verify → on match-with-old-format, derive new hash at N=131072 and
   UPDATE → mint JWT.

5. **Logger PII mask** → service log call → winston format pipeline:
   timestamp → label → piiMaskFormat (recursive walk with WeakSet
   circular-guard) → json → transport.
