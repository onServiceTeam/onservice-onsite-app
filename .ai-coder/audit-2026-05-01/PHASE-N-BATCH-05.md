# Phase N Batch 5 — provider-admin.service.ts (1 file, 999 lines)

## File fully read
- packages/api/src/services/provider-admin.service.ts (999)

## Findings

### CONFIRMS CRIT-128 (Phase F03 audit) — getProviderProfile returns null KYC fields despite migration 035 having them
**Where found:** packages/api/src/services/provider-admin.service.ts:51-58
```ts
documents: {
  nbiClearanceUrl: string | null;
  nbiExpiryDate: string | null;
  nbiExpiryNotified: boolean;
  avatarUrl: string | null;
  // Government ID + selfie fields not present in current schema (see HONESTY-CHECK).
  governmentIdUrl: null;
  selfieUrl: null;
},
```
And at line 248-249:
```ts
governmentIdUrl: null,
selfieUrl: null,
```

**Understood:** The interface declares `governmentIdUrl: null` (literal type — never anything else) and the formatter returns hardcoded null. The comment claims fields are "not present in current schema" but Phase J migration 035 demonstrated:
- `government_id_front_url TEXT`
- `government_id_back_url TEXT`
- `selfie_url TEXT`
- `ic_agreement_accepted_at TIMESTAMPTZ`

These were added in Sprint 8. The service has been carrying the wrong assumption ever since. Result: admin opens Provider Detail → Documents tab → sees only NBI fields. Government ID and selfie photos uploaded by providers via `terms.tsx`'s `/api/v1/providers/apply` endpoint are written to the DB columns but never displayed in admin review.

**This is the active KYC compliance gap** flagged in F03 CRIT-128 and Phase G CRIT-158. The data exists; the service ignores it.

**Fix (covered by Phase I-B Dispatch P0-3):**
1. SELECT `government_id_front_url, government_id_back_url, selfie_url, ic_agreement_accepted_at` columns from providers table.
2. Update ProviderProfile.documents type to include them as `string | null`.
3. Update formatter to return values.
4. Phase J also identified migration 085 created a separate `provider_documents` table — decide canonical (probably 085's table since it supports multiple doc types per provider) and migrate inline columns to the table.

### POSITIVE — Phase 14 D06 transactional discipline (4 bug fixes verified)
- **Bug 78** (adjustProviderWallet, line 898): Wallet UPDATE + wallet_transactions INSERT + admin_actions INSERT in ONE transaction. Pre-D06: no admin_actions audit. Now atomic. Refuses negative-balance adjustments. Reference ID embeds admin user.
- **Bug 79** (updateProviderProfile, line 811): Profile UPDATE + admin_actions audit in ONE transaction. Snapshots before-state into audit details for diff history.
- **Bug 80** (deleteProviderNote, line 752): Soft delete (deleted_at/deleted_by/deleted_reason from migration 076) + admin_actions audit in ONE transaction. Pre-D06 was hard DELETE with no audit.
- **Bug 82** (createProviderNote, line 637): Note INSERT + admin_actions audit in ONE transaction. Pre-D06 had no audit at all.

### POSITIVE — Read filtering of soft-deleted rows
- listProviderNotes (line 619) filters `WHERE n.deleted_at IS NULL`. Bug 80 fix.

### POSITIVE — Note edit/delete permission check
- updateProviderNote (line 721) + deleteProviderNote (line 775): `if (row.author_id !== authorId && !isSuperAdmin)` returns 403. Author OR super_admin only.

### POSITIVE — Wallet adjustment safety rails
- Line 928-930: refuses adjustment that would make wallet negative.
- Line 945: description string embeds `[admin:${adminUserId}]` for forensics in the wallet ledger.

### POSITIVE — getProviderActivity merges audit + login history
- Line 538-570: parallel queries for audit_log + login_attempts. Sorted by createdAt desc, capped at 200.

### MED-N13 — Reviews query LIMIT 200 with no pagination
- Line 422 + 486: getProviderReviews and getProviderDisputes both LIMIT 200 with no pagination. Provider with 200+ reviews/disputes is silently truncated.
- **Fix:** Accept page/pageSize, use LIMIT/OFFSET, return total count.

### MED-N14 — getProviderActivity does not maskPiiForRole on IP/userAgent
- Line 572-590 returns raw `r.ip_address` and `r.user_agent`. Per Phase 14 D08 PII masking, junior admin should see masked IPs. Same gap pattern as CRIT-N02 in admin.routes audit log.

## Cumulative Phase N progress: 5 / 104 files (~6,135 lines)
