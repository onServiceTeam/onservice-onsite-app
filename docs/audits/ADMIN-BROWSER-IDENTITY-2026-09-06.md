# Admin browser identity: UX-1374

Date: 2026-09-06. Base: `28faad9e1f77ff8c6bd68c98c941c8d69de0b03c`.
Status: source fix and local build/HTTP regression verified; not deployed.

## Confirmed defect and change

`apps/admin/index.html` referenced `/vite.svg`, which was absent from the
retained Admin candidate. A real build and real Vite preview request reproduced
the consequence: the browser-icon URL returned status 200 with `text/html`,
the SPA fallback, instead of an image. An ordinary successful HTTP status
would have missed this broken resource.

The HTML now references `../mobile/assets/icon.png` as `image/png`. This is
the existing onService icon already selected by the customer/provider web and
native app configuration, not a new brand design. Vite includes its own
content-hashed copy inside the Admin artifact's `assets/` directory. The built
site does not depend on a sibling mobile source directory being served.

No bitmap was edited or duplicated in source. The shared 17,113-byte PNG is
unchanged, SHA-256:
`b85ba36f88570e3dc4ff74e5cb07dc14c7f3c9c7ce97095272ac1a3ebae39e6b`.

## Executed regression

`apps/admin/src/__tests__/bug-ux-1374-admin-brand-icon.real.test.ts` builds
the actual Admin app and HTML into a newly created temporary directory. It
starts the real Vite preview server on loopback with an ephemeral port,
requests and parses the served HTML, follows its same-origin icon reference,
and checks status, MIME type, PNG signature, exact canonical bytes and the
hashed output path. A fallback HTML response cannot pass. It does not execute
application JavaScript or contact the production API.

The build disables dotenv loading, selects production mode and environment,
and explicitly disables/clears the demo values. The Node test environment
avoids substituting browser-realm typed arrays into the build tool. Environment
stubs, parsed DOM, preview server and verified test-owned output directory are
cleaned up. No existing build directory or user data is removed.

Evidence, in order:

1. The first harness attempt failed before any test ran because esbuild could
   not run in jsdom's mixed typed-array environment. This is **not** counted as
   an application failure reproduction. The test was moved to the normal Node
   environment, with jsdom used only to parse the actual served HTML.
2. Against the unchanged `/vite.svg` application, the corrected test failed on
   the actual `text/html` response where `image/png` was required: one failed
   test, 24.38 seconds overall (22.67 seconds in the test).
3. After the one-line HTML fix, the same assertions passed: one file / one
   test, 13.08 seconds overall (11.03 seconds in the test).
4. Final targeted ESLint and Admin TypeScript both passed. An initial lint
   error on an unnecessary DOM type annotation was corrected by removing that
   annotation, not by changing the assertion or lint configuration.

Reproduce from `apps/admin/`:

```sh
node ../../node_modules/vitest/vitest.mjs run src/__tests__/bug-ux-1374-admin-brand-icon.real.test.ts
```

Fresh independent CI at this new fix is required. The preceding release-core
checkpoint's successful CI is recorded in
[its audit](PAIRED-RELEASE-CORE-2026-09-06.md); it does not certify this change.

## Boundaries and next work

- This is real built-HTML/resource-serving evidence, not a Chromium screenshot,
  authenticated Admin acceptance, production nginx test or full asset graph.
- The paired publisher still needs production host adapters, provenance and
  compatibility acceptance, complete resource validation and failure recovery.
- Design documentation still needs reconciliation. The full-read design
  contract lists the old primary/status palette, while the token JSON and
  current Admin/mobile theme use the approved newer palette. There are also
  differences between JSON semantic neutrals/radii and current runtime styles,
  and between documented button sizes and the actual 44/48-pixel component.
  Those are findings, not resolved items. Do not copy older, lower-contrast
  values into working screens simply to obtain string equality.
- The broader provider/customer/admin screen, business/support/payment and
  operational sign-off requirements remain open. No account, payment, database,
  live source, frontend or shared service changed for this fix.
