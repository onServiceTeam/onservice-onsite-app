# Admin TOTP configuration diagnostics

Date: 2026-09-06. Base: `93ffd8921eda3f67feb6628428fa67829fcb9d7a`.
Bug SEC-073. Candidate correction, not production deployment.

The real encryption helper included the first eight characters of an invalid
`TOTP_ENCRYPTION_KEY` in its thrown diagnostic. Errors can reach logs; a generic
phone/email masker is not a guarantee that arbitrary key fragments disappear.
No production key or log containing key material was inspected. This finding
does not establish that a production secret was exposed.

The correction removes only those supplied characters. The setting name, format
requirement and received length remain visible for diagnosis. Invalid values
still fail. AES-256-GCM, key configuration, ciphertext format, the existing
plaintext-compatibility branches, application records, login and recovery
authority are unchanged. The separate production boot guard already rejects
missing or malformed encryption configuration and is not weakened.

## Executed evidence

The new test imports and calls actual `encryptSecret` and `decryptSecret` with
invalid test-only values. It inspects the thrown error message and stack rather
than searching source strings. The pre-fix run failed the redaction assertion
while its supporting real-encryption test passed: one failure, one pass,
3.546 seconds. No real key appears in the failed output.

After the correction, all three focused suites / **18 tests passed in 1.368
seconds**: the new regression, existing admin-2FA service tests, and production
2FA guard tests. The supporting real-crypto test checks differing IV-based
ciphertexts for the same plaintext, both successful decryptions and rejection
after a ciphertext byte is altered. Environment values are restored in `finally`.
Changed-file ESLint and API TypeScript passed. Fresh CI remains required at
this local checkpoint; these are not authenticated browser or production tests.

```sh
npm --workspace @onservice/api test -- --runInBand --runTestsByPath \
  __tests__/bug-sec-073-totp-key-diagnostic-redaction.test.ts \
  __tests__/services/admin-2fa.service.test.ts \
  __tests__/admin-2fa-prod-guard-a1.test.ts
```

No dependency, schema, credential, production account, bypass flag, recovery
hold or money path changed. Broader privileged-session/recovery governance and
coordinated API/admin/customer-provider release acceptance remain open.
