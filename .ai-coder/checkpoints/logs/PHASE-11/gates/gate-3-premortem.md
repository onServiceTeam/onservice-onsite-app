# Gate 3 — Pre-mortem (Phase 11)

## Production failure scenarios

1. **Audit log table grows unbounded** — DSR + consent inserts add rows. NPC requires 5-year retention. Mitigation: existing audit_log already accumulates without partitioning; add a partitioning migration in a future ops phase.
2. **DSR 15-day SLA missed** — admin team forgets. Mitigation: `getDsrAlerts` surfaces 2-day-or-less rows in dashboard; if the DSR backlog grows, an out-of-band notification (email DPO) is still required.
3. **CSV export OOM on huge audit logs** — current implementation builds the whole CSV as a single string. Mitigation: cap pagination at the SQL level for unfiltered exports (not yet implemented; future ops phase should stream).
4. **Audit insert silently fails** — wrapped in try/catch + logger.warn. The DSR or consent row still commits. This is the correct safety tradeoff (compliance writes must never block on audit), but ops must monitor `logger.warn` for `audit_log insert failed` and treat as a SEV.
5. **Consent revoke race** — recordConsent with granted=false reads prior granted rows then updates. Two simultaneous revokes could write two new revoke rows. Acceptable: NPC requires history; downstream analysis uses the latest row.
6. **Browser tab caches DSR list** — TanStack Query cache may show stale DSR statuses. Mitigation: refetchInterval 30s on DSR queue (set in CompliancePage). Manual refresh available.
7. **CSV export auth bypass via direct fetch** — `responseType: 'blob'` keeps Authorization header attached via the existing `api` axios instance. Direct `window.open` would have stripped it; explicit avoidance documented.
8. **BIR calendar timezone drift** — date math uses server time. For Asia/Manila users, dueDate strings are computed as `YYYY-MM-DD` (no time portion); admin display formats with explicit `timeZone: 'Asia/Manila'`.
9. **Migration 057 conflict if run twice** — uses `IF NOT EXISTS`-style or relies on the fail-on-rerun semantics of the migration runner. Migration runner already records applied migrations.
10. **Sidebar "Compliance" entry visible to non-admin users** — N/A: admin app is admin-only behind login + role gate; route is also admin-only by way of every endpoint requiring `requireAdmin`.
