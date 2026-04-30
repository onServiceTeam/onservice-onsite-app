# Gate smoke tests

These tests verify each gate fragment **rejects a known-bad pattern**. Without them a gate could silently break (e.g., a regex regression makes the gate accept everything). The smoke tests catch this class of bug.

Each test follows the same shape:

1. Create a temp working tree with a synthetic violation.
2. Run the gate (or the specific fragment) against it.
3. Assert the gate exits non-zero AND mentions the synthetic violation.
4. Clean up the temp tree.

Run all smoke tests:

```bash
bash scripts/gates/__tests__/run-all.sh
```

Each test exits 0 on pass, non-zero on fail. `run-all.sh` aggregates and exits non-zero if any test failed. CI invokes `run-all.sh` as part of Gate C's "constitution" article-set (article `gate-smoke-tests`, BLOCKING after D03).

Adding a new gate? Add a corresponding smoke test here. The pattern: synthesize a violation, run the gate, assert rejection.
