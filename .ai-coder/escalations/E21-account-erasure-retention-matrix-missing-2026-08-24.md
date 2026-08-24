# E21: Account erasure retention matrix is missing

Date: 2026-08-24
Status: Hard stop for claiming complete erasure
Area: Customer/provider account deletion, NPC data rights, retained uploads

## Bad news first

The current account-deletion cascade is anonymization, not complete deletion. It changes the core user identity, deletes addresses and session tokens, redacts messages sent by the user, clears review comments, and deactivates a provider. It does not remove every personal-data field or physical uploaded object.

Examples that remain include booking addresses and descriptions, public upload files, chat image files, booking photos/signatures, dispute descriptions/evidence, support content, provider government-ID/selfie/TIN/payout details, portfolio/certification files, and some user-linked transaction/compliance records.

Deleting all of those records blindly may conflict with BIR, AMLA, payment reconciliation, active legal claims, fraud prevention, and record-integrity requirements. Keeping all of them indefinitely is also not defensible. The repo does not contain an attorney/DPO-approved table-by-table retention matrix that resolves the conflict.

## Safe remediation completed during discovery

- The mobile copy no longer promises deletion of “all associated data.”
- A failed `processing` request is selected again by the next worker run instead of remaining stuck forever.
- Eligibility is checked again after cooling-off. If a booking, dispute, available balance, or pending balance appeared during the 30 days, deletion is deferred and returned to a cancellable cooling-off state.
- Session invalidation and the existing database anonymization remain atomic.

## Decision required

The DPO/attorney must approve a retention matrix covering at least:

1. users and provider identity/KYC fields;
2. bookings, addresses, intake answers, completion notes, photos, and signatures;
3. chat/support/dispute text and uploaded evidence;
4. wallets, payment intents, payouts, tips, invoices, tax records, and AML review evidence;
5. reviews, notifications, consent/audit/security records, referrals, and marketing attribution;
6. database rows versus physical local/S3 objects, including backup retention;
7. retention period, legal basis, deletion/anonymization action, and authorized viewers for each class.

Recommendation: approve the matrix first, then implement an idempotent erasure manifest that records each database and object-storage action, retries physical deletion, and gives the DPO an exception report. Do not mark NPC erasure “complete” solely because the core `users` row was anonymized.

## Production impact

A read-only check on 2026-08-24 found one historical account-deletion request and it was cancelled. There were zero active deletion requests, so no current user is waiting in the incomplete cascade. No production user, booking, wallet, upload, or deletion row was changed during this audit.
