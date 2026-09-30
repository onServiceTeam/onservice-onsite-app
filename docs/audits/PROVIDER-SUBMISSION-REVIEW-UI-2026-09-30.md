# Provider 360: review preserved submissions separately from the current profile

Date: 2026-09-30. Base: `ee16e2e38a286439b5b4e7b450f3fe9eab8deaf5`.
Application: onService PH marketplace. E35/E74 remain open. Approval/rejection
are still not bound to the exact submission reviewed. This change is the
read-only operator screen, not completion of the application lifecycle or a
production deployment.

## Recovered state and implementation

Work began on September 7 and was interrupted before documentation/publication.
The September 30 recovery verified the unchanged local/remote review-branch
base, the expected seven unpublished implementation/test files and the existing
eight protected untracked files. Old validation/preview process handles were
missing; fresh checks were started only after that verification. No assertion
of work continuing throughout the interruption is made.

`ProfileTab` actually renders `ProviderSubmissionHistory` above an explicitly
labelled current profile. Opening the panel reads the bounded revision index;
choosing a submission reads only that exact revision. The screen displays all
fields in the current reader contract: business, location, original market and
category IDs/names, radius, optional ID/NBI/experience details, questionnaire,
references, agreement/submission/recording times, revision identity/chain and
record format. Null, zero and false are kept distinct. Dates use the recorded
date-only value; timestamps show Philippine time and retain their exact ISO
value in the rendered time element.

Current provider status is labelled as context, not evidence that a particular
revision was approved. Original account name and agreement wording/version
were not captured by this schema; the UI explicitly says so. Legacy missing
history is not fabricated from the current profile. A failed, malformed,
wrong-provider, wrong-revision, unsupported-format or inconsistent response is
an error, not an empty application or another revision. Exclusive older/newer
paging preserves the server cursor and distinguishes an empty older page from
no captured history. Refreshing returns to the latest page and clears selection.

Private data remains in component memory, outside the operational profile
cache and browser persistence. Closing the panel, changing provider or retiring
the operator's sign-in unmounts evidence and aborts pending reads. Requests use
the real existing cookie/session-aware client. This does not solve the separate
E79 cross-tab/cookie-ordering limitation.

Each original document loads only on explicit request. All four returned paths
must match the selected provider/revision/type before any document control is
offered. The client constructs that exact private API path, never a supplied
storage/bearer link. Only JPEG/PNG/WebP/PDF previews are accepted; HTML/SVG or
missing originals fail without a replacement. Image previews have specific
labels; a loaded file can be explicitly opened in a new tab. Object URLs are
revoked when the preview/panel is closed or its owner is abandoned. This cannot
retract a file already saved by an authorized operator. Applicant-supplied URLs
are plain text, not executable HTML or automatically trusted destinations.

No approval action, role grant, payment, notification, retention rule, migration,
legacy backfill, dependency, gate or branch-protection change is included.
The existing current-profile document viewer is not claimed fixed by the new
history viewer; its separate delayed-open behavior still needs review.

## Executed evidence and limits

- UX-1376 first failed on the real rendered profile: the history action was
  absent. The initial sandbox attempt failed before running tests; the scoped
  authorized baseline then failed at the actual missing control (19.29 seconds).
- Three new files contain four real rendered tests. They use the real profile
  tab, auth store, transport and response parsing with synthetic HTTP responses.
  They check exact historical fields, optional omissions, unsupported/mismatched
  data, error/retry, paging, delayed selection, safe document types, explicit
  loading, private request paths, aborts and object-URL retirement after a fresh
  same-operator sign-in or another provider. They do not exercise a real server.
- An initial implementation run passed two tests and failed two because the
  assertions matched the intermediate loading status instead of waiting for
  the final message. Correcting those waits produced **3 files / 4 passing
  tests**, 3.33 seconds. No application assertion was removed.
- The pre-interruption full admin run passed **594 files / 702 tests**, with
  one existing skipped file and three existing TODOs, 186.71 seconds. Early
  type checks caught a discriminated-union annotation and an inferred test
  helper return type; both were corrected without suppressions. Lint's two
  undefined-global findings were corrected to `globalThis.AbortSignal`.
- Recovery TypeScript, changed-file lint, the unchanged regression-ID gate
  (**1,586 titled regressions**) and diff checks passed. The production build
  succeeded and produced the same content-hashed provider chunk as before
  interruption (`ProviderDetailPage-cSCCsfU6.js`).
- The first recovery full run failed **3 tests**, with 591 passing files / 699
  passing tests, one skipped file and three TODOs (224.85 seconds). Existing
  logout and approval-rationale tests hit their unchanged 5-second deadlines;
  UX-1371 did not receive its lazy password heading within the unchanged wait.
  All three files then passed unchanged with two workers (**7 tests**, 5.07
  seconds). This supports investigating execution contention, not erasing the
  failed run or claiming proof that the default-concurrency suite is reliable.
  The full two-worker recovery run then passed **594 files / 702 tests**, with
  the same one skipped file and three TODOs, 484.97 seconds. This run started
  before the final header-only layout correction below. The final build and
  compiled-browser regression cover that correction; TypeScript and
  changed-file lint also passed again afterward.
- `apps/admin/tests/browser/provider-submission-history.test.js` exercises the
  compiled real App at **1440, 1024, 768 and 390 pixels** using isolated
  synthetic API responses. All four widths passed twice, including after
  recovery: keyboard Enter/Space actions, long unbroken applicant text, no page
  horizontal overflow, 44px document controls, explicit original-image loading
  and preview closure, no unexpected API request/write or browser exception.
  Full-page screenshot capture replaced the original tall-element capture
  because the sticky header obscured the top of that capture. Visual inspection
  then found a real narrow-screen defect that the no-overflow assertion missed:
  the header action squeezed its explanation into a thin column. UX-1377 adds
  a browser geometry assertion that the action sits below the explanation at
  390px. It failed against the old compiled layout, then passed after changing
  the header to stack vertically below the existing `sm` breakpoint.
  The final production build passed (9.27 seconds,
  `ProviderDetailPage-B2QIG_W6.js`); the browser test passed all four widths
  (5.131 seconds). Desktop/tablet captures and the final corrected narrow
  full-page capture were inspected. Captures are private under ignored
  `qa-frameworks/`. The unchanged regression-ID gate now passes **1,587 titled
  regressions**, including UX-1377. No gate configuration was relaxed.

The browser uses a synthetic sign-in response and a one-pixel document fixture.
It is not authenticated backend/storage acceptance, production-byte verification,
a PDF-rendering acceptance test, load testing, native coverage or a visual
baseline. The latest supplied Stitch ZIP was still absent from its original
Downloads location on September 30. Existing design-contract components/tokens
were reused; latest-Stitch parity and every-screen completion are not claimed.

## Next required lifecycle work

1. Bind both admin decision entry points to the exact displayed submission and
   reject stale reviews; add immutable decision records on the same provider.
2. Standardize owner/provider locking across relevant decision/correction paths
   before enabling corrections. Exercise concurrent review/resubmit and rollback
   on actual PostgreSQL, not only mocked UI responses.
3. Complete reasoned changes-requested and applicant correction/resubmission,
   reviewer ownership and participant notifications. Keep `sent_back` held
   until both actor paths exist; rejection is not a request for corrections.
4. Address governed legacy admission, original-object preservation and E21/E43
   retention/privacy execution without manufacturing historical evidence.
5. Rehearse migration 173 on the full selected-image schema, verify matched
   API/admin/customer-provider artifacts and authenticated journeys, then use
   the governed release/rollback process. Master/live alignment is not achieved
   by pushing the review branch or passing this isolated UI check.

No new production inspection, live login, master merge, deployment, whole-app
status percentage or launch-ready claim is made for this stage.
