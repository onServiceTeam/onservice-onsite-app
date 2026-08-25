# Admin operations stage audit, 2026-08-25

## Status

This is the durable route-by-route control ledger for the admin overhaul requested by Ken. It is intentionally incomplete. `W1` means the current stage inspected and changed the named surface with rendered behavior tests. It does not mean every state on that page has been manually exercised. `NEXT` means the page remains in the active screen-by-screen pass. `HOLD` means money, compliance, legal, or policy behavior cannot be changed autonomously even though safe visual and accessibility work may continue.

Current code checkpoint: `0facf52d0662a465a74c0e3dd65cc6ac2618afb1`.

## Shared admin contract established in W1

- The shell now has a bounded 1,600-pixel workspace, route and record breadcrumbs, collapsible desktop navigation, mobile navigation without decorative shadow, truthful production/staging/development labeling, Philippine time, keyboard page search, and a reachable account menu at phone through desktop widths.
- Search is explicit about its current limit. It searches page and workspace destinations only. It does not pretend to search bookings, people, tickets, disputes, or payouts.
- Shared buttons and form controls now meet the 44-pixel target contract. Cards, inputs, menus, dialogs, switches, tooltips, KPI cards, and the dispatch drawer use solid borders rather than decorative shadows.
- Consequential actions now have reusable accessible in-app confirmation and reason dialogs. The reason dialog can write the operator's actual reason into APIs that already support audit notes.
- Catalog service and add-on deletion is correctly presented as deactivation. It requires a reason and preserves historical booking evidence while removing the option from new customer booking.
- Service-area activation states the customer booking, provider matching, capacity, and waitlist effects. Default-market changes state their customer/provider map and picker effects.
- Business-account approval states payment terms and credit limit before mutation. Suspension no longer asks twice after a reason has already been supplied.
- Notification-template decisions, recurring cancellation, A/B lifecycle actions, and provider-quality recomputation no longer use browser-native prompts.
- The final provider review emoji icon was replaced with the centralized `Star` icon after the icon-governance check found it.

## Routed screen ledger

| Route | Company/support purpose | Stage | Current boundary or next check |
| --- | --- | --- | --- |
| `/login` | Admin authentication | PRIOR | Dedicated operations context exists. Recheck current Stitch visual states with the final shell release. |
| `/change-password` | Credential rotation | W1/PREVIOUS | Account menu now reaches it at all widths. Existing forced-rotation behavior remains unchanged. |
| `/` | Command center | NEXT | Re-audit every queue, metric definition, source failure, and cross-link after shell release. |
| `/providers` | Provider queue | NEXT | Recheck application filters, bulk support workflow, capacity context, and Provider 360 exits. |
| `/providers/:id` | Provider 360 | NEXT | Recheck every tab, staff suspension, internal notes, evidence, payout, service-area, booking, and support linkage. |
| `/customers` | Customer queue | NEXT | Recheck search, segmentation, masking, status, and Customer 360 exits. |
| `/customers/:id` | Customer 360 | NEXT | Recheck account enforcement, fraud-review context, booking/support/payment linkage, and audit evidence. |
| `/bookings` | Booking operations queue | NEXT | Recheck status definitions, service-area context, assignment, customer/provider exits, and tablet table behavior. |
| `/bookings/:id` | Booking 360 and evidence | HOLD/NEXT | Safe layout can continue. Escrow release, refund, cancellation, and force-complete actions are money-path decisions. |
| `/catalog` | Customer bookable scope and provider fulfillment contract | W1 | Service/add-on deactivation now requires audit reason and states customer impact. Continue modal and all pricing-type state visuals. |
| `/projects` | Larger-work planning oversight | NEXT | Preserve D28 and milestone escrow holds while checking customer/provider linkage and honest capability boundaries. |
| `/disputes` | Trust queue | HOLD/NEXT | Safe case layout can continue. Resolution outcome changes remain under E18/E24 money-path holds. |
| `/disputes/:id` | Dispute 360 | HOLD/NEXT | Recheck evidence chronology and role exits. Settlement/reopen semantics remain held. |
| `/financials` | Payments, escrow, tax workpapers, reconciliation | HOLD | No money/tax mutation behavior changed in W1. Requires dedicated finance audit and decision-safe tests. |
| `/payouts` | Provider withdrawal decisions | HOLD | Existing internal large-payout review is not described as statutory AML. Transfer and decision behavior remain money-path controlled. |
| `/notification-templates` | Customer/provider communications | W1 | Create, update, activate, deactivate, and delete use in-app decisions with channel impact. Continue variable validation and preview audit. |
| `/recurring` | Series support | W1/HOLD | Cancellation has one reasoned decision and clear existing/future booking impact. E20 still holds automatic charging. |
| `/business-accounts` | Enterprise account queue | W1 | Approval previews terms and credit limit; suspension explains booking and invoicing impact. |
| `/business-accounts/:id` | Enterprise account 360 | NEXT | Recheck members, contracts, invoices, bookings, account owner/manager, and support linkage. |
| `/service-areas` | Market, coverage, and provider-capacity control | W1 | Activation/default/pause/create decisions now state cross-role effects. Continue create/edit responsive layout and provider-request decision states. |
| `/analytics` | Decision support | W1 | A/B and quality actions are accessible and explicit; retention and commission remain truth-labeled. Continue complete tab state visuals. |
| `/audit-log` | Operator accountability | NEXT | Recheck actor, target, reason, before/after detail, filters, export, and links back to source records. |
| `/support-tickets` | Support case queue | NEXT | Recheck SLA truth, assignment, private/public notes, customer/provider/booking linkage, and all empty/error states. |
| `/staff` | Company access and responsibility | NEXT | Recheck role truth, candidate selection, DPO segregation, account status, and support-team workflow. |
| `/settings` | Platform configuration | HOLD/NEXT | Live, held, and unconnected classifications exist. Money/security settings need source-specific review and rollback preview. |
| `/settings/cancellation-policy` | Customer cancellation presentation | HOLD | E09 blocks changing policy/money semantics until display and refund math have one authority. |
| `/pricing-rules` | Surge and revenue-share control | HOLD | E28 records the missing server-authoritative preview/staged publication decision. Only safe Stitch surface cleanup occurred in W1. |
| `/marketing` | Promotions, referrals, campaigns | NEXT | Recheck feature flags, audience truth, delivery state, redemption linkage, and held payment claims. |
| `/dispatch` | Live assignment and coverage | W1 PARTIAL/HOLD | Decorative shadows and fixed drawer width were corrected. Reassignment/cancellation remain booking and refund-path controlled. |
| `/communications` | Cross-role message operations | NEXT | Recheck conversation ownership, delivery state, participant/booking linkage, escalation, and privacy boundaries. |
| `/feedback` | Third-party tester feedback queue | NEXT | Trace every production submission to owner, decision, linked screen, implementation, and closure evidence. |
| `/compliance` | Regulatory and tax controls | HOLD | Dedicated compliance review required. No regulatory meaning or status behavior changed in W1. |
| `/data-protection-log` | DSR operations | HOLD | E21 retention matrix and DPO process remain authoritative blockers for semantic changes. |
| `/consent-versions` | Legal-document publication history | HOLD | F#10/E26 legal-source conflict remains open. Safe layout work only until attorney-approved wording/status is reconciled. |
| `*` | Safe route recovery | PRIOR | Existing rendered recovery remains. Recheck final shell breadcrumb behavior after all routes settle. |

## Remaining browser-native confirmations after W1

W1 reduced the count from 44 to 31. The remaining prompts are deliberately visible here rather than being hidden by a false completion claim.

| Screen | Count | Reason not converted in W1 |
| --- | ---: | --- |
| Booking 360 | 4 | Escrow, refund, cancellation, and completion money effects |
| Compliance | 2 | DSR/regulatory action and export scope |
| Consent Versions | 1 | Legal publication lifecycle |
| Customer 360 | 2 | Account suspension and fraud review need enforcement evidence design |
| Data Protection | 4 | DSR completion, information request, rejection, and NPC escalation |
| Dispute 360 | 2 | Escalation/reopen tied to dispute lifecycle |
| Disputes queue | 1 | Resolution outcome can apply money effects |
| Dispatch | 2 | Provider reassignment and cancellation/refund flow |
| Financials | 5 | Reconciliation and tax workpaper operations |
| Payouts | 1 | Provider-money decision |
| Pricing Rules | 1 | Live charge/revenue-share rule toggle under E28 |
| Provider 360 | 2 | Staff suspension and internal-note deletion |
| Cancellation Policy | 1 | E09 policy/refund authority conflict |
| System Settings | 3 | Live configuration, cache, and reset impact |

## W1 verification

- Admin: 102 test files passed, 1 skipped; 215 tests passed, 3 explicit todos.
- Admin TypeScript and lint passed.
- Admin production build passed across 2,839 modules.
- Focused mobile provider-review behavior test passed.
- Icon governance passed with no emoji used as interface iconography.
- `git diff --check` passed.
- GitHub CI and production deployment are separate required evidence and are not claimed by this local record.

