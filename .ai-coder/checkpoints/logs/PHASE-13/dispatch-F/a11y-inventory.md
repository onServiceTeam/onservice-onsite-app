# Phase 13 Dispatch F — Admin A11y Inventory

**Generated:** 2026-04-29
**Scope:** `apps/admin/src/pages/**/*.tsx` + `apps/admin/src/components/**/*.tsx`
**Total controls reviewed:** 187

## Summary

| Classification | Count | % |
|---|---|---|
| LABELED-PROPER | 48 | 25.7% |
| LABEL-NO-ID-PAIRING | 12 | 6.4% |
| PLACEHOLDER-ONLY | 67 | 35.8% |
| ICON-ONLY-NO-ARIA | 38 | 20.3% |
| BARE | 22 | 11.8% |

---

## Pattern groups (for sweep planning)

### 1. PLACEHOLDER-ONLY search/filter inputs — 67 occurrences across 11 files
**Affected pages:** CustomersPage, BookingsPage, ProvidersPage, AuditLogPage, DisputesPage, RecurringPage, NotificationTemplatesPage, ServiceAreasPage, DispatchConsolePage, CatalogPage, SystemSettingsPage.

**Fix:** assign unique `id` + add `aria-label="Search/Filter <plural-noun>"` (faster than wrapping with `<Label>` for top-of-list filters where a visible label is already absent by design). Pattern reference: DataProtectionLogPage filter row.

```tsx
// BEFORE
<input type="text" placeholder="Search by name..." value={q} onChange={e => setQ(e.target.value)} />

// AFTER
<input
  id="customers-search"
  type="text"
  placeholder="Search by name, phone, or email"
  value={q}
  onChange={e => setQ(e.target.value)}
  aria-label="Search customers by name, phone, or email"
/>
```

### 2. ICON-ONLY-NO-ARIA action buttons — 38 occurrences across 8 files
**Affected:** DisputesPage, ProvidersPage, ProviderDetailPage, NotificationTemplatesPage, SystemSettingsPage, MarketingPage, PricingRulesPage, AnalyticsPage.

**Fix:** infer label from icon + row context.
```tsx
<button aria-label={`Edit dispute ${r.id.slice(0, 8)}`}><Pencil size={16} /></button>
```
Pattern reference: DataProtectionLogPage row-action buttons.

### 3. LABEL-NO-ID-PAIRING checkboxes — 12 occurrences across 5 files
**Affected:** CompliancePage L240, partial DataProtectionLogPage, SystemSettingsPage filter sections, LoginPage 2FA inputs.

**Fix:** explicit `htmlFor` + `id`.
```tsx
<label htmlFor="filter-overdue-only" className="flex items-center gap-2 cursor-pointer">
  <input id="filter-overdue-only" type="checkbox" checked={overdueOnly} onChange={e => setOverdueOnly(e.target.checked)} />
  Overdue only
</label>
```

### 4. BARE inputs — 22 occurrences across 4 files
AnalyticsPage A/B test form, CatalogPage modals, PricingRulesPage form, LoginPage 2FA.
**Fix:** ConsentVersionsPage publish-dialog pattern (Label + Input + id + aria-label + aria-describedby).

---

## Per-file inventory (most representative entries — full detail in pattern groups)

### apps/admin/src/pages/AnalyticsPage.tsx
| Line | Element | Class | Fix |
|---|---|---|---|
| 68 | `<input placeholder="Test name">` | BARE | Label htmlFor="ab-test-name" + id |
| 69 | `<textarea placeholder="Description">` | BARE | Label htmlFor="ab-test-desc" + id |
| 71 | `<select>` metric | BARE | Label htmlFor="ab-test-metric" + id |
| 73 | `<input type="number" placeholder="split">` | BARE | aria-label="Traffic split percentage" |

### apps/admin/src/pages/AuditLogPage.tsx
| Line | Element | Class | Fix |
|---|---|---|---|
| 98 | `<input placeholder="Filter by action…">` | PLACEHOLDER-ONLY | aria-label="Filter audit log by action" |
| 104 | `<input placeholder="Filter by entity type">` | PLACEHOLDER-ONLY | aria-label="Filter audit log by entity type" |

### apps/admin/src/pages/BookingsPage.tsx
| Line | Element | Class | Fix |
|---|---|---|---|
| 102 | `<input placeholder="Search by booking ID or city…">` | PLACEHOLDER-ONLY | id="bookings-search" + aria-label |
| 108 | `<select>` status filter | PLACEHOLDER-ONLY | id="bookings-status-filter" + aria-label |

### apps/admin/src/pages/CatalogPage.tsx
- Modal inputs (name, description, price, etc.): ~6 BARE per editor (category, subcategory, addon).
- Apply ConsentVersionsPage pattern across all three editors.

### apps/admin/src/pages/CompliancePage.tsx
| Line | Element | Class | Fix |
|---|---|---|---|
| 240 | checkbox in label | LABEL-NO-ID-PAIRING | htmlFor + id |

### apps/admin/src/pages/ConsentVersionsPage.tsx
**FULLY COMPLIANT.** Use as template.

### apps/admin/src/pages/CustomersPage.tsx
| Line | Element | Class | Fix |
|---|---|---|---|
| 97 | search input | PLACEHOLDER-ONLY | id="customers-search" + aria-label |
| 109 | status select | PLACEHOLDER-ONLY | id + aria-label |

### apps/admin/src/pages/DataProtectionLogPage.tsx
- 95% compliant. 1 checkbox at L360 needs htmlFor/id.

### apps/admin/src/pages/DisputesPage.tsx
| Line | Element | Class | Fix |
|---|---|---|---|
| 84 | search | PLACEHOLDER-ONLY | aria-label="Search disputes" |
| 90 | status select | PLACEHOLDER-ONLY | aria-label="Filter by status" |
| 96 | tier select | PLACEHOLDER-ONLY | aria-label="Filter by tier" |

### apps/admin/src/pages/LoginPage.tsx
| Line | Element | Class | Fix |
|---|---|---|---|
| 207 | email/password | LABELED-PROPER (sufficient) | optional aria-label |
| 250 | 2FA TOTP input | LABEL-NO-ID-PAIRING | htmlFor + id |
| 290 | 2FA enrollment input | LABEL-NO-ID-PAIRING | htmlFor + id |

### apps/admin/src/pages/MarketingPage.tsx
- Overview-tab date filters OK.
- Promo code modal: verify and add aria-label/Label as needed.

### apps/admin/src/pages/NotificationTemplatesPage.tsx
| Line | Element | Class | Fix |
|---|---|---|---|
| ~140 | toggle button | ICON-ONLY-NO-ARIA | aria-label="Toggle template active" |
| ~145 | edit button | ICON-ONLY-NO-ARIA | aria-label={`Edit template ${name}`} |
| ~148 | delete button | ICON-ONLY-NO-ARIA | aria-label={`Delete template ${name}`} |

### apps/admin/src/pages/PricingRulesPage.tsx
- Create/edit dialog: ~7 BARE inputs. Refactor with Label wrapper.

### apps/admin/src/pages/ProvidersPage.tsx
| Line | Element | Class | Fix |
|---|---|---|---|
| 97 | search | PLACEHOLDER-ONLY | aria-label="Search providers" |
| 108 | status select | PLACEHOLDER-ONLY | aria-label="Filter by status" |
| 113 | tier select | PLACEHOLDER-ONLY | aria-label="Filter by tier" |

### apps/admin/src/pages/RecurringPage.tsx
| Line | Element | Class | Fix |
|---|---|---|---|
| 86 | search | PLACEHOLDER-ONLY | aria-label="Search recurring bookings" |
| 91 | status select | PLACEHOLDER-ONLY | aria-label="Filter by status" |

### apps/admin/src/pages/ServiceAreasPage.tsx
| Line | Element | Class | Fix |
|---|---|---|---|
| 86 | search | PLACEHOLDER-ONLY | aria-label="Search service areas" |
| 91 | status select | PLACEHOLDER-ONLY | aria-label="Filter by status" |
| modal | form inputs | BARE | Label + Input pattern |

### apps/admin/src/pages/SystemSettingsPage.tsx
- Settings editor: input + textarea BARE → aria-label.
- Reset button: ICON-ONLY-NO-ARIA → aria-label="Reset to default".

### apps/admin/src/components/Header.tsx
**OK** — text on logout button.

### apps/admin/src/components/Sidebar.tsx
**OK** — every NavLink has icon + visible text.

---

## Sweep recommendations

1. **Mechanical batch — placeholder-only filters (67):** assign id + aria-label per pattern group 1.
2. **Mechanical batch — icon-only buttons (38):** infer label from icon component name + row context.
3. **Case-by-case — BARE modals (22):** AnalyticsPage A/B form, CatalogPage editors, PricingRulesPage create/edit, LoginPage 2FA. Use ConsentVersionsPage as template.
4. **Quick sweep — checkbox htmlFor/id pairing (12).**
5. **Files already clean — skip:** ConsentVersionsPage, DataProtectionLogPage (mod 1 checkbox), Header, Sidebar.

## Files most problematic
1. AnalyticsPage.tsx
2. CatalogPage.tsx
3. AuditLogPage.tsx
4. DisputesPage.tsx
5. SystemSettingsPage.tsx

---

*Inventory cap note: 187 controls audited; per-file detail above lists the most representative entries per group. The mechanical-sweep approach (groups 1, 2, 4) covers ~117 controls programmatically; case-by-case modal refactors (group 3) cover the remaining ~22 BARE inputs.*
