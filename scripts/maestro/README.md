# Maestro state-trigger scripts

D-J27 / F#3 fix.

These scripts drive the Maestro visual baseline captures into specific
UI states (loading / empty / error / success). Each posts to a
`/__test/...` endpoint on the local API.

The endpoints are **only mounted** when both:

- `NODE_ENV !== 'production'`, AND
- `ENABLE_TEST_FIXTURES=1`

If either is false, the router returns empty — production is doubly
protected against accidental exposure.

## Setup

```bash
# Local docker stack must be up with the gating env var set:
ENABLE_TEST_FIXTURES=1 bash scripts/dev/up.sh

# Confirm the test endpoints are reachable:
curl -s -X POST http://localhost:7381/__test/reset
# -> {"success":true,"data":{"reset":true}}
```

## Scripts

| Script | What it does |
|---|---|
| `force-error.sh` | Arms the API to return 500 on the NEXT request (single-shot). |
| `seed-empty.sh <scope>` | Truncates the named tables so the next read shows the empty state. Scopes: bookings, notifications, wallet, messages. |
| `seed-success.sh <scope>` | Repopulates the named tables with happy-path fixtures. Scopes: bookings, notifications. |

## Maestro flow integration

Each YAML flow under `apps/mobile/.maestro/visual/<kind>/` has 3
commented-out screenshot blocks (loading / empty / error / success).
Uncomment and add a `runScript` step to call one of these scripts:

```yaml
# Example: capture the booking-list empty state
- runScript: ../../../scripts/maestro/seed-empty.sh bookings
- launchApp: { stopApp: true }
- tapOn: { text: 'Bookings' }
- takeScreenshot: customer/booking-list/empty
```

After running the flow, `seed-success.sh` can be called to restore
fixtures before the next flow.

## Operator workflow

See `.ai-coder/handoff/F3-maestro-baseline-capture.md` for the full
84-flow capture procedure including iOS/Android simulator setup.
