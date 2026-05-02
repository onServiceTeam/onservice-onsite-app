# Audit 2026-05-01 — Phase N Batch 20 — slot-waitlist, support-ticket, admin-2fa, socket, messaging, notification-template

**Status:** 6 service files fully read line-by-line, ~1,374 lines covered.

## Files fully read (6 files, 1,374 lines)

| File | Lines |
|---|---:|
| packages/api/src/services/slot-waitlist.service.ts | 267 |
| packages/api/src/services/support-ticket.service.ts | 250 |
| packages/api/src/services/admin-2fa.service.ts | 232 |
| packages/api/src/services/socket.service.ts | 223 |
| packages/api/src/services/messaging.service.ts | 205 |
| packages/api/src/services/notification-template.service.ts | 195 |

## NEW MEDIUM findings (10)

### MED-N133 — slot-waitlist processSlotAvailability marks 'notified' but never dispatches notification

**Where:** slot-waitlist.service.ts:125-156

```ts
await db.query(
  `UPDATE booking_slot_waitlist SET status = 'notified', notified_at = NOW()
   WHERE id = ANY($1)`,
  [ids],
);
logger.info('Slot waitlist entries notified', { ... });
```

Status is updated to 'notified' but no `notificationService.createNotification` or push call is made. Customer expecting "we'll let you know when a slot opens" gets nothing. Status is theatre.

**Fix:** Call `notificationService.createNotification` per entry (or bulk) inside this function. Add type 'slot_available' to NotificationType union.

### MED-N134 — slot-waitlist joinSlotWaitlist non-transactional dedup check

**Where:** slot-waitlist.service.ts:49-80

Existence check (line 49) then INSERT (line 63). Race: two simultaneous joins from same customer for same date both pass the check, both INSERT. UNIQUE constraint may catch but raw error surfaces.

**Fix:** Either (a) add `ON CONFLICT (customer_id, category_id, preferred_date) WHERE status = 'waiting' DO NOTHING` and check rowCount, or (b) use transaction with FOR UPDATE.

### MED-N135 — support-ticket createTicket no admin_actions audit

**Where:** support-ticket.service.ts:133-164

If an admin creates a ticket on behalf of a user (or system creates one from a webhook), no audit row is written. Admin's actions on customer support tickets should be auditable.

**Fix:** When called by admin role, write admin_actions row.

### MED-N136 — support-ticket addMessage + UPDATE conversation not transactional

**Where:** support-ticket.service.ts:166-191

INSERT support_ticket_messages then UPDATE support_tickets.updated_at as separate db.query calls. If UPDATE fails after message INSERT, ticket's updated_at is stale — can affect ordering of "new message" notifications.

**Fix:** Wrap in transaction.

### MED-N137 — support-ticket no PII masking on user fields returned to admins

**Where:** support-ticket.service.ts:87-101 and getTicketById:106-118

Returns `user_phone, user_email, user_first_name, user_last_name` to admin queries. PII mask pattern from `pii-mask.ts` (covered in Phase M) is not applied. Junior admin reading ticket sees raw customer phone/email.

**Fix:** Apply `maskPiiForRole` at format time, threading viewer role through.

### MED-N138 — socket.service admin sockets keep privilege past JWT exp

**Where:** socket.service.ts:71-81

When socket connects, JWT is verified and `socket.userRole` is captured (line 64). For the lifetime of the socket connection (potentially hours), the role is trusted. JWT expiry isn't re-checked. An admin demoted to dpo can keep emitting admin events until they reconnect.

**Fix:** Either (a) periodic re-auth (every 15 min, query DB for current role), OR (b) emit a force-disconnect on role change events tracked in socket.service.

### MED-N139 — socket.service no rate limiting on send:message / mark:read

**Where:** socket.service.ts:97-155

Socket events `send:message`, `mark:read`, `typing:start/stop` have no rate limiting. A malicious client can flood `typing:start` events to other users.

**Fix:** Add per-socket rate limiting (e.g., max 60 events/minute) using a simple in-memory counter or socket.io middleware.

### MED-N140 — messaging.service BYPASS_KEYWORDS missing Tagalog patterns

**Where:** messaging.service.ts:29-33

```ts
const BYPASS_KEYWORDS = [
  'gcash', 'maya', 'direct', 'outside', 'cash', 'bank transfer',
  'personal number', 'facebook', 'messenger', 'viber', 'whatsapp',
  'telegram', 'text me', 'call me directly',
];
```

Phase M's bypass-detection cron (workers.ts) explicitly includes Tagalog terms ("bayad mo na lang", "PM mo", "sa labas", "off-app"). This in-flight message detection misses those — Filipino-speaking attempts at platform bypass go through unflagged.

**Fix:** Sync the keyword list with workers.ts bypass-detection. Move the canonical list to a single shared module or platform_settings.

### MED-N141 — messaging.service sendMessage + conversation update not transactional

**Where:** messaging.service.ts:91-123

INSERT messages then UPDATE conversations.updated_at as two separate db.query calls. If UPDATE fails after message INSERT, the conversation row's last-activity timestamp is stale — affects sort order in conversation listings.

**Fix:** Wrap in transaction.

### MED-N142 — notification-template deleteTemplate hard DELETE, no audit

**Where:** notification-template.service.ts:156-162

```ts
const result = await db.query(`DELETE FROM notification_templates WHERE id = $1 RETURNING id`, [templateId]);
```

Hard delete with no audit row. Templates affect customer-facing notification copy — admin removing a template should be traceable.

**Fix:** Soft-delete via `deleted_at, deleted_by, deleted_reason`. Add admin_actions audit. Wrap in transaction.

## POSITIVE findings

1. **Phase 14 D10 admin-2fa backup codes verified end-to-end** (Bug 357/358/360):
   - 8 codes per admin, scrypt-hashed at write
   - Single-use enforced via used_at column
   - Soft-delete on regeneration with audit
   - Confusing-char-excluded alphabet (no I, O, 0, 1)
   - timingSafeEqual on verify
2. **Bug 1251 admin cookie auth in socket** verified at socket.service.ts:31-41 — prefers HttpOnly cookie when present, falls back to handshake.auth.token for mobile.
3. **Phase 14 D04 SiguradoShield deferral** correctly absent from messaging service (no insurance-related copy).
4. **Phase 14 admin event constants** centralized in `ADMIN_EVENTS` (socket.service.ts:202-212) — discoverable + consistent.
5. **socket.service test-only helper** (`_setIoForTest`, line 221) properly documented as "MUST NOT be called from production code".
6. **Bug 1271 native fetch** verified — no axios across all 6 files.

## Confirmations

- **CRIT-N02 (PII masking gap)** family extended: support-ticket service (MED-N137) is a third site lacking PII masking on admin reads.
- **Phase 14 D10 Bug 357/358/360** verified at admin-2fa.service.
- **Phase M bypass-detection cron** (covered in M-batch) confirms Tagalog-aware list exists; messaging service drift (MED-N140) is the gap.

## Cumulative running totals (after Phase N Batch 20)

| | Total | Batch 20 additions |
|---|---:|---:|
| **CRITICAL** | **187 real** | 0 |
| **MEDIUM** | **618 + 10 = 628** | **+10** |
| Lines fully read | ~133,145 / 146,236 | +1,374 |
| Coverage | **91.0%** | +0.9% |
