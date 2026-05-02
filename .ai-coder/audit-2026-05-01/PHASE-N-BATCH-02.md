# Phase N Batch 2 — admin-analytics.service.ts (1 file, 1,314 lines)

## File fully read
- packages/api/src/services/admin-analytics.service.ts (1,314)

## Findings

### MED-N04 — getChurnPrediction loads all customers into memory then paginates in JS
**Where found:** packages/api/src/services/admin-analytics.service.ts:362-439
**Understood:** The query at line 379 has no LIMIT/OFFSET. ALL customer rows return, JS computes risk score per row, filters by riskLevel, then `slice(offset, offset + safePageSize)`. For a platform with 100k+ customers, every page request loads all of them into Node memory and drops 99.98% of them.
**Fix:** Push the risk-score computation into SQL (CASE WHEN ... ELSE END) so the query can ORDER BY + LIMIT/OFFSET in the database. Return only the requested page.

### MED-N05 — Provider quality "responseScore" is hardcoded 75; not actually computed
**Where found:** packages/api/src/services/admin-analytics.service.ts:518
```ts
const responseScore = 75;
```
**Understood:** The 5-component quality score (rating/completion/timeliness/cancellation/response) is documented as a real model in platformConfig.qualityScoreWeights. But responseScore is a constant. Provider response-time doesn't affect quality score. The "response" weight (10% per platformConfig) is effectively distributed evenly — providers can have terrible response time without penalty.
**Fix:** Compute responseScore from booking_quotes table (avg time between job-request created and quote-submitted by this provider). Fall back to 75 only if zero quotes in period. Document the formula.

### MED-N06 — getCommissionOptimizationSuggestions reads platformConfig.commissionRates instead of platform_settings
**Where found:** packages/api/src/services/admin-analytics.service.ts:712
```ts
const currentRate = platformConfig.commissionRates[tier]!;
```
**Understood:** The "currentRate" used as basis for suggestion is the hardcoded constant in platform.config.ts, not the actual server-canonical rate from platform_settings. If admin updated the rate via /admin/settings (and migration 050 schema has the rates), the suggestion compares to the WRONG starting point. "Suggested rate" can be off by 5-10%. Same pattern as MED-K20/M20.
**Fix:** Source `currentRate` from settingsService.getSettingNumber(`commission_rate_${tier}`). Falls back to platformConfig only if not set.

### MED-N07 — Quality score "founding" tier missing from commission optimization
**Where found:** packages/api/src/services/admin-analytics.service.ts:648
```ts
const tiers = Object.keys(platformConfig.commissionRates);
```
**Understood:** Same MED-K20 family. platformConfig.commissionRates has 4 tiers (no 'founding'). Provider-tier suggestions never include 'founding' tier providers.

### POSITIVE — A/B test statistical significance
- Lines 180-196 — proper z-score test with pooled standard error. 95% confidence threshold (z >= 1.96), 90% (z >= 1.645). Minimum sample size 30 per variant before calling a winner.

### POSITIVE — getDashboardKpis batches queries via Promise.all
- 4 separate aggregate queries in parallel rather than serial. Lines 883-934.

### POSITIVE — getOperationalAlerts batches 7 detection queries in parallel
- consecutive 1-star, stale disputes, webhook failures, NBI expiring, chronic-disputes customers, underserved cities, guarantee fund low. Lines 1069-1166.

### POSITIVE — Commission optimization rationale
- Lines 727-735 — explicit thresholds: high quality + high revenue → suggest decrease; low quality → suggest increase; low provider count → suggest decrease for recruitment. Clear rationale string per suggestion.

### POSITIVE — Quality score computation has UPSERT pattern
- Lines 530-543 — INSERT ... ON CONFLICT DO UPDATE. Idempotent. Same period_start/period_end gets recomputed cleanly.

## Cumulative Phase N progress: 2 / 104 files (~2,928 lines)
