# Marketplace release observers

Date: 2026-09-06. Base: `205db8512a7a5c42040b6340358a01511826d085`.
This closes part of the paired publisher's host-observation gap. It does not
complete coordinated deployment, approve rehearsal artifacts, or certify the
customer/provider/admin business and design acceptance work.

## Implemented scope

`scripts/server/served-web-files.mjs` streams actual HTTPS bytes, checks status,
MIME type, expected length and SHA-256, rejects redirects and unexpected
compression, and enforces a total deadline even if a server trickles data.
Only the two marketplace web hostnames and the supported static-file paths are
accepted. Local-loopback connections still verify the intended hostname using
SNI and certificate validation. Cookies, authorization headers and TLS bypass
options are not provided. A custom CA exists only as a low-level TLS-fixture
input; the fixed production factory never supplies one.

`scripts/server/marketplace-release-observers.mjs` inspects the local Docker
daemon through fixed executable/daemon paths with a minimal environment.
It validates the exact marketplace service names, project labels, running
state, image/container identities, read-only web/configuration mounts and local
HTTPS binding. Host and mounted directory device/inode identities must agree.
Inspection excludes container environment values. No other business's file
contents are read, and no shared service is changed.

Every requested file is hashed inside the existing nginx container and read
through both its local HTTPS endpoint and public HTTPS ingress. The file-list
contract is shared with the publication core; the complete requested list is
validated before Docker or network reads. Nginx identity, roots and mounted
main-configuration hash must remain stable across checks and match the release
journal's destination identities. This hashes the mounted main configuration;
it does not attest all included configuration or prove that on-disk configuration
is the last configuration loaded into nginx. Actual served bytes are checked
separately.

The API observer checks the exact existing container before and after its
loopback readiness endpoint, requiring PostgreSQL and Redis readiness. Curl
configuration and proxy inheritance are explicitly disabled. A failed or
malformed health response never becomes success. Image activation, migrations,
checkout updates, release acceptance and rollback acceptance are not exported.
Passing this observer object alone to publication fails for missing acceptance.

## Real test evidence and discovered false alarm

The initial direct run passed 39 observer cases and 31 existing publication
cases: 70 passes, no failures/skips/TODOs, 19.731 seconds. The normal API Jest
bridge passed both suites in 26.246 seconds, printing their individual TAP
outcomes. The initial lint run found an unused readiness initializer; it was
removed without changing lint rules. Types and lint subsequently passed.

The first actual live observation then failed before HTTPS: the two Docker
inspections returned the same mount records in different array orders, which
the new observer incorrectly considered a host change. Two independent actual
mount inspections confirmed the order change and the unchanged nginx start
time. This was a defect in the new observer, not evidence of an application
outage or an unexpected deployment.

An added regression reproduced the defect before correction: 40 passes and
one failure in 1.741 seconds. It asserts successful observation of equivalent
reordered mount/label inventories. A separate case rejects a genuinely changed
mount source despite a reorder. The implementation now sorts the unordered
mount inventory and compares object contents without depending on object-key
order; it preserves all recorded fields and identity checks.

Final normal API harness: **two suites / two outer tests passed in 24.287
seconds**, comprising **41 observer cases** (1.581 seconds) and **31 publication
cases** (21.965 seconds), all passing with no child skips/TODOs. The bridge
requires those exact counts and prints each outcome; outer API totals are not
inflated by child counts. Final explicit ESLint and API TypeScript also passed.
Fresh CI for this new slice remains required at this local checkpoint.

The TLS tests use actual ephemeral loopback HTTPS listeners and one-day
OpenSSL-generated fixture certificates. Tests cover chunked bodies, stale bytes,
SPA HTML fallback, redirects/401/404, excess/truncated bodies, total deadline,
untrusted and wrong-host certificates, unsafe targets/paths, container contracts,
API replacement/readiness, destination mismatch, configuration drift, and actual
temporary-filesystem publish/rollback using the observed HTTPS bytes. Container,
activation and acceptance transports in these fixtures are explicitly substituted.
Test-owned temporary roots are checked before cleanup; no production accounts,
data, trust settings or credentials participate.

Reproduce without contacting production:

```sh
node --test --test-reporter=tap scripts/server/__tests__/marketplace-release-observers.test.mjs
node --test --test-reporter=tap scripts/server/__tests__/paired-web-release.test.mjs
```

## Actual server observation

After correcting the false alarm, transferred module hashes were verified
against local bytes before an unprivileged, bounded Node 20.20.2 run. The
observer used its real production defaults, not fake Docker/HTTPS callbacks.
At **2026-09-06 10:53:07 UTC** the second observation completed with exit 0:

- Admin: entry HTML, five immediate JavaScript files and one CSS file agreed
  between host hashes, mounted-file hashes, local HTTPS and public HTTPS.
- Customer/provider web: entry HTML, favicon and the 7,607,667-byte entry
  JavaScript file agreed across the same paths.
- Existing nginx/container/root identities and the mounted main-configuration
  hash stayed unchanged. The existing API image stayed unchanged and reported
  both database and Redis ready before and after observation.

This is **10 selected files and 20 actual HTTPS reads**, not the full artifact
inventory or a resource-graph audit. The private probe selects immediate
`assets/`, `_expo/static/js/web/` and `favicon.ico` references; it does not certify
other root-level references, recursively inspect JS/CSS, execute browser code,
or test authenticated journeys. In particular it does not certify the separate
admin browser-icon issue fixed at the preceding source checkpoint.

The failed and successful logs are retained privately with exact identities,
file hashes, script hashes and access notes. No credentials, SSH material or
private logs are committed. Only a private temporary tooling directory was
written. No live checkout, frontend file, API image, database, account, nginx
configuration or other business service was changed. `releaseAcceptance`
remained false; candidate eligibility flags remain false.

## Still required

1. Exact master/artifact/CI provenance and genuine promotion/acceptance evidence.
2. Reviewed activation and rollback adapters, API/client/schema compatibility,
   abrupt-process recovery and disk/permission fault verification.
3. Complete static and runtime dependency verification, including unresolved
   computed imports and CSS, plus authenticated old/new-client journeys.
4. Full provider/customer/admin UX and business/support/payment linkage checks,
   remaining application fixes and independent operational/professional signoffs.

Local review source, GitHub master and the live deployment are still different
revisions. These checks are progress toward safe alignment, not alignment itself.
