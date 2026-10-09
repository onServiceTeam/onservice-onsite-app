# E66 - Notification-template channel publication and versioning

**Date:** 2026-09-02
**Status:** AWAITING KEN DECISION; SAFE CODE CONTAINMENT IMPLEMENTED ON TOPIC BRANCH
**Hard stop:** customer/provider communication publication architecture,
external SMS/email delivery, locale strategy, retry/outbox semantics, and
production template history
**Related:** ADMIN-SPEC Module 11, E32 production access, E40 legal privacy
wording, notification preference and marketing-consent contracts

## Bad news

The Admin Notification Templates page and older training copy implied a
per-channel publishing system for SMS, email, push, and in-app messages. That
system does not exist.

The live API consults this table for only two slugs:

1. `new_job_available`, sent to a provider; and
2. `booking_matched`, sent to a customer.

Both use the same title/body for the in-app notification record and a
best-effort Expo push. The stored `channel` column is not read by the delivery
workflow. No notification-template path sends SMS or email. The remaining
seeded and operator-created rows are reference-only metadata.

Setting a connected row inactive or deleting it does not stop the booking
notice. The service deliberately uses built-in fallback copy so a broken or
missing template does not suppress a safety-critical workflow. Therefore the
old active-toggle wording could make an operator believe delivery had stopped
when it had not.

The current one-row-per-slug table has no locale, channel variant, immutable
version, draft/published state, effective date, approval, test-send record,
outbox attempt, provider receipt, or rollback pointer. A hard delete retains an
audit snapshot, but that is not a publication history or restore workflow.

## Safe containment implemented

The topic-branch containment does not add a migration or activate a new
delivery provider. It:

- reports the two connected workflows as in-app plus push regardless of the
  legacy stored `all` marker;
- prevents an operator from changing a connected workflow to false SMS/email
  authority;
- labels every other row reference-only and its channel value metadata-only;
- states that inactive/deleted connected rows use built-in fallback copy;
- makes ordinary Admin accounts read-only and reserves the full lifecycle for
  `super_admin`;
- requires a 10-to-2,000-character reason for create, update, activate,
  deactivate, and delete at both route and service boundaries;
- rejects no-op updates; and
- retains the mutation and reason in the existing transactional Admin action.

This containment is safe because it changes neither recipient selection nor
the notification send path. Existing fallback behavior remains in place.

## Why this is a hard stop

Implementing the ADMIN-SPEC target is not a page-local UI change. Choosing SMS
or email introduces consent and preference checks, provider credentials,
content-length and formatting rules, deliverability status, retries,
idempotency, cost controls, suppression, bounce handling, and incident support.
Adding versions introduces decisions about immutable publication, locale
fallback, effective dates, rollback, and which version a queued notification
must retain.

The current production template rows and any manual operator habits must also
be inventoried privately before a schema migration. E32 prevents that
inventory. Existing rows must not be reclassified, deleted, or silently
published to a new channel.

## Option A - staged, versioned, per-channel publication (recommended)

Keep the current two connected in-app/push workflows under containment, then
build the target in controlled stages:

1. Define immutable template versions by event slug, audience, locale, and
   delivery channel. Keep draft, approved/published, retired, effective time,
   variable contract, actor, reason, and prior-version linkage.
2. Make a queued notification retain the exact published version and rendered
   payload used. Never recalculate historical sends after a later copy edit.
3. Add preview and test-send as non-production-recipient operations with
   explicit environment, destination, actor, reason, and delivery evidence.
4. Add an outbox with idempotency, bounded retry, permanent-failure state, and
   provider message/receipt identifiers before activating another channel.
5. Integrate each channel separately. Enforce transactional-notice rules,
   marketing consent, user preferences, suppression, provider limits, and
   channel-specific content before publication.
6. Preserve the hardcoded fallback as an explicit, tested emergency version
   for required booking notices. An operator must never infer that deactivation
   silently suppresses a required notice.
7. Migrate existing rows only after the E32 production inventory, keeping
   reference-only rows unpublished unless each runtime event is deliberately
   connected and tested.

This option scales because publication history, delivery evidence, customer
preferences, and provider retries remain separate concerns while sharing one
event contract. It also avoids rewriting old transactions or notification
history.

## Option B - retain one mutable row per slug

Keep `channel` as descriptive metadata and continue using a single mutable
title/body. This is not recommended. It cannot safely represent channel
variants, locale, queued-version retention, rollback, or delivery evidence.

## Option C - immediately wire the current row to SMS and email

This is not recommended. One shared body cannot safely satisfy push, SMS,
email, consent, formatting, cost, retry, and suppression requirements. It could
also turn dormant reference rows into broad sends without reviewed recipient or
preference contracts.

## Required decision

Approve Option A before any migration, external SMS/email integration, test
send, locale publication, version conversion, or production template
reclassification. Until then, keep the containment and do not claim that the
Admin page controls channels beyond the two named in-app/push workflows.

## Work paused

Do not add a delivery provider, migrate production rows, reinterpret stored
`channel`, suppress required booking notices, or publish reference-only copy.
Safe review, tests, and documentation of the containment may land on the topic
branch. Master promotion and production synchronization remain separately held
under E32.
