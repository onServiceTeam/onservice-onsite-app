# onService — Definition of Done & Bug Standard

## Definition of Done (per story)

A story is Done when all of the following are true:

1. **Acceptance criteria met** — written before work starts, demoable.
2. **Tests exist and are real** — for Tier 1/2 work (money, state machine,
   authz, compliance), automated coverage that fails if the feature breaks. No
   file-exists or source-string assertions dressed as tests (see CLAUDE.md).
3. **Exploratory charter run** — for any Tier 1/2 story, one session-based
   charter (`docs/qa/EXPLORATORY-CHARTERS.md`) with notes attached.
4. **The 5 CI gates pass** (A–E) and the relevant unit/component suites are green.
5. **No new P1/P2 open** against the story's area without a risk-register entry.
6. **Docs updated** — if behavior changed, `LAUNCH-LIMITATIONS.md` and the risk
   register reflect it; no quietly editing a limitation away to "close" it.
7. **Accessibility not regressed** — interactive elements keep labels/roles.

A story that "works on my machine" but has no test that proves it is **not** Done.

## Bug-writing standard

Every bug report uses this shape. One bug per report.

```
TITLE: <one line — what's wrong>

WHERE: <Customer app | Provider app | Admin | API> → <screen/endpoint>
URL / REQUEST: <address-bar URL or METHOD path>
ACCOUNT / ROLE: <which login, e.g. Maria 9171234567 / customer>
ENVIRONMENT: <local | staging> + <device/browser>
BUILD: <commit or build hash if known>

STEPS TO REPRODUCE:
1.
2.
3.

EXPECTED:
ACTUAL:

EVIDENCE: <screenshot / recording / console errors / response body>
FREQUENCY: <every time | intermittent (n of m)>
SEVERITY: <P1 launch/money/legal | P2 degraded | P3 minor>
SUSPECTED AREA: <optional — helps triage>
```

### What makes a bug fixable on first read
- Exact steps and the exact URL/request. "It's broken" is not a bug.
- One bug per report — don't bundle.
- Evidence beats prose: a screenshot or a 20-second recording.
- For web errors, include the browser console (F12 → Console) red lines.
- State whether it reproduces every time or intermittently.
- Severity by impact, not annoyance: money/legal/blocked-flow = P1.

## Severity guide (shared language)

| Sev | Meaning | Examples |
|---|---|---|
| **P1** | Money wrong, legal/compliance breach, or a core flow fully blocked. | Wrong commission; can't complete a booking; IDOR; charged twice. |
| **P2** | Degraded but workable; a feature broken with a workaround. | Chat send unreliable; a tab errors but others work. |
| **P3** | Minor/cosmetic; no flow impact. | Misaligned label; offline banner in a11y tree; copy typo. |

## Triage flow
P1 → stop-the-line, fix-forward, add a regression test naming the bug.
P2 → sprint backlog with a risk-register entry + workaround for support.
P3 → polish backlog, batched.
