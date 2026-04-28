# Gate 3 — Future Bugs (Phase 11)

1. **DPO action log UI not built** — narrative-only in spec. Backend has no `dpo_actions` table.
2. **Consent version manager UI not built** — admin cannot bump privacy policy version + trigger re-acceptance flow today. Backend can store versioned rows; the publishing UI is missing.
3. **Mobile DSR submission UI missing** — only the API endpoint exists; no Settings → Privacy screen.
4. **Tax Documents tab is a stub** — placeholder UI; would call `/api/v1/admin/bir/exports` (Phase 08) once wired.
5. **Regulatory Reports tab is a stub** — `window.alert` only.
6. **DSR-triggered data export worker missing** — `response_payload_url` column exists; no S3 export job wired. Admin must paste URL manually after producing the export out-of-band.
7. **Audit-log CSV export builds the whole CSV in memory** — large date ranges may OOM. Stream variant needed for >1M rows.
8. **No NPC notification webhook** — NPC requires DPO email confirmation within 72h; out-of-band today.
9. **No retention pruning** — audit_log/consent_records grow forever. NPC says 5y; needs partitioning + drop-partition job.
10. **DSR queue not paginated server-side beyond limit/offset** — for >10k DSRs the UI should add server cursor pagination.
11. **`getBirCalendar` is hardcoded** — schedule changes (BIR amends frequency or due dates) require code change. Future: read from a `bir_filing_schedule` table.
12. **CompliancePage state is local React state, not URL-synced** — refresh loses tab + filters. Acceptable for v1.
