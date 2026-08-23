# E17 — Bare production domain is absent from the TLS certificate

**Date:** 2026-08-24

**Status:** OPEN — production certificate correction required
**Hard-stop reason:** Production documentation claimed DNS and TLS were fully
valid, but the certificate served for the bare domain does not cover that name.

## Bad news first

`https://onservice.ph` fails certificate validation before nginx can redirect
the request to `https://app.onservice.ph`. The application, admin, API, and
`www` hosts remain available with a currently valid certificate.

## Evidence

Read-only production checks on 2026-08-24 established that:

- `onservice.ph`, `www.onservice.ph`, `app.onservice.ph`,
  `admin.onservice.ph`, and `api.onservice.ph` resolve to `46.62.207.225`;
- nginx serves `/etc/letsencrypt/live/api.onservice.ph/fullchain.pem` for the
  onService virtual hosts;
- the certificate is valid from 2026-08-02 through 2026-10-31;
- its Subject Alternative Names are `admin.onservice.ph`,
  `api.onservice.ph`, `app.onservice.ph`, and `www.onservice.ph`;
- `onservice.ph` is absent from both the installed certificate and the current
  renewal-domain configuration;
- a client SNI check against the apex therefore receives a certificate whose
  names do not match `onservice.ph`.

No certificate, nginx configuration, DNS record, or production secret was
changed during discovery.

## Why this paused

The repository's launch status said “DNS + TLS done” and “valid cert in
production.” That statement conflicts with the live certificate. Reissuing a
production certificate changes shared ingress state on a server that hosts
other applications, so it should not be silently folded into an unrelated app
deployment.

## Options

### Option A — Expand the existing onService certificate (recommended)

Reissue the existing `api.onservice.ph` certificate with all five onService
names, including `onservice.ph`. Preserve the existing redirect and nginx
configuration, verify the renewed lineage includes every name, reload nginx,
and test all five hostnames externally. This is the smallest correction.

### Option B — Issue a separate apex certificate

Give the bare-domain redirect virtual host its own certificate. This isolates
the apex but adds another certificate lineage and renewal path to operate.

### Option C — Remove the apex HTTPS entry

Do not use this option. DNS users and existing links would continue to reach a
hostname that cannot complete HTTPS safely, and HTTP-only redirection is not an
adequate replacement.

## Recommendation

Use Option A during a short, explicit ingress maintenance action. Before
issuance, back up the nginx and Let's Encrypt configuration and confirm the
ACME challenge path for every name. Afterward, verify certificate SANs,
renewal dry-run behavior, redirects, app/API health, and the unrelated virtual
hosts on the shared server.

## What I need from Ken

Authorize Option A, or choose Option B. The independent application audit and
deployments can continue while this certificate action remains open.
