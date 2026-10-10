# E69: Provider-staff accounts have no safe account and privacy workspace

Date: 2026-09-02
Status: OPEN
Area: Provider staff, account security, data-subject rights, account deletion
Risk: Account-access and privacy-workflow gap

## Bad news first

A signed-in `provider_staff` user currently has assigned jobs, invitations,
shared support, and logout. The staff route group has no profile, password,
session, notification, account-data, or Data Rights workspace. The desktop rail
likewise exposes only Assigned Jobs, Invitations, and Support.

The authenticated compliance API accepts a provider-staff DSR, and the Admin
Data Protection Log now resolves that user to the employing Provider 360
record. That server/admin linkage does not give the staff member a usable app
entry point for access, correction, or erasure requests.

## Why the customer screen cannot simply be reused

The customer Data Rights screen includes an erasure action. Creating an
erasure DSR best-effort starts the generic account-deletion pipeline. The repo
does not define how that pipeline should handle an approved or assigned
provider-staff membership, current `performer_staff_id` work, the employing
provider's evidence history, or a staff account that was historically linked
to more than one provider.

Exposing that existing screen without resolving those consequences could
disable or anonymize a worker account while leaving active job assignment and
provider-team state inconsistent. E43 already holds the missing canonical
relationship between DSR cases and deletion execution. E21 separately holds
the approved retention matrix.

## Recommended scalable resolution

Use one role-aware Account & Privacy workspace shared by customer, provider
owner, and provider staff, but keep authority explicit:

1. Let provider staff review and update their own basic account identity through
   the canonical audited profile route.
2. Give them password/session security and a direct DPO/privacy-request entry.
3. Keep DSR case creation role-neutral and link the case to the staff member and
   employing Provider 360 record.
4. Make the DSR the canonical compliance case and the deletion request its
   linked execution record, as recommended by E43.
5. Before staff erasure executes, transactionally evaluate active assigned
   bookings, staff status, provider ownership/history, balances, disputes, and
   the E21 retention matrix. Preserve historical performer attribution.
6. Provide an explicit provider handoff/reassignment result when current work
   blocks or defers deletion. Never silently clear an active performer.
7. Add phone, tablet, and desktop evidence for the staff account/privacy route,
   plus bidirectional Admin DSR and Provider 360 linkage tests.

## Work paused at the unsafe boundary

No customer-only route guard was weakened, no staff account was deleted or
anonymized, and no assignment or provider-team row was changed. Safe auditing
and unrelated fixes can continue. Implementing staff erasure execution must
wait for the E21/E43 data and compliance decisions rather than inventing a
partial default.
