#!/usr/bin/env python
"""
Phase 14 Remediation #3 — Generate scaffolded Maestro YAML flows.

Reads /tmp/all-mobile-screens.txt (one screen path per line) and emits
one apps/mobile/.maestro/visual/{customer,provider}/NNN-<slug>.yaml file
per screen.

Each flow scaffolds the 4-state (loading/empty/error/success) capture
pattern. The 3 takeScreenshot lines for empty/error/success are commented
out by default; the operator running F#3 baseline capture uncomments
them as they wire each screen's state-trigger script. The default-state
screenshot is uncommented so the first capture run yields at least one
baseline per screen.

See .ai-coder/handoff/F3-maestro-baseline-capture.md for the full
operator runbook.
"""

import os

YAML_TEMPLATE = """appId: com.onservice.app
---
# Phase 14 Remediation #3 - visual baseline flow for {slug}
# Screen: {path}
#
# Captures 4 states (loading, empty, error, success) at the device's
# native viewport. Operator runs `maestro test --update-snapshots` to
# capture baselines into apps/mobile/.maestro/visual/baselines/{kind}/.

- launchApp:
    clearState: true
    stopApp: true

# Default render
- takeScreenshot: {kind}/{slug}/default

# Loading state - API stalls so skeleton renders.
# Uncomment when the operator wires a delay-fixture in scripts/maestro/.
# - runScript: scripts/maestro/force-loading.sh
# - takeScreenshot: {kind}/{slug}/loading

# Empty state - navigate with empty fixture (route-specific).
# Uncomment when the operator wires an empty-fixture seeder.
# - runScript: scripts/maestro/seed-empty.sh
# - takeScreenshot: {kind}/{slug}/empty

# Error state - force network error.
# - runScript: scripts/maestro/force-error.sh
# - takeScreenshot: {kind}/{slug}/error

# Success state
# - runScript: scripts/maestro/seed-success.sh
# - takeScreenshot: {kind}/{slug}/success
"""


def slug(path):
    base = os.path.relpath(path, "apps/mobile/app").replace(".tsx", "")
    for ch in ("[", "]", "(", ")"):
        base = base.replace(ch, "")
    base = base.replace(os.sep, "/")
    return base.replace("/", "-").strip("-")


def kind(path):
    p = path.replace(os.sep, "/")
    if (
        "provider-tabs" in p
        or "/provider/" in p
        or "provider-onboarding" in p
    ):
        return "provider"
    return "customer"


def main():
    with open("scripts/dev/.screens-list.txt") as f:
        paths = [line.strip() for line in f if line.strip()]

    customer = []
    provider = []
    for p in paths:
        k = kind(p)
        s = slug(p)
        (customer if k == "customer" else provider).append((p, k, s))

    print(f"customer={len(customer)} provider={len(provider)}")

    n_customer = 0
    for path, k, s in customer:
        n_customer += 1
        folder = f"apps/mobile/.maestro/visual/{k}"
        os.makedirs(folder, exist_ok=True)
        fname = f"{folder}/{n_customer:03d}-{s}.yaml"
        with open(fname, "w", encoding="utf-8") as f:
            f.write(YAML_TEMPLATE.format(slug=s, path=path, kind=k))

    n_provider = 0
    for path, k, s in provider:
        n_provider += 1
        folder = f"apps/mobile/.maestro/visual/{k}"
        os.makedirs(folder, exist_ok=True)
        fname = f"{folder}/{n_provider:03d}-{s}.yaml"
        with open(fname, "w", encoding="utf-8") as f:
            f.write(YAML_TEMPLATE.format(slug=s, path=path, kind=k))

    print(f"total flows written: {n_customer + n_provider}")


if __name__ == "__main__":
    main()
