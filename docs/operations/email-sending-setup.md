# Email sending setup (for sign-in codes)

Written 2026-10-12 for Ken. Why this is needed: phone codes are paused (D37),
so sign-in codes go by email. Our server cannot send email by itself (Hetzner
blocks outgoing mail ports), and `onservice.ph` has no email records yet, so
any email from it would land in spam or be refused. These steps fix both.
They take about 15 minutes plus DNS waiting time.

Nothing here costs money for testing. Resend's free plan allows 3,000 emails a
month and 100 a day.

## 1. Create the Resend account (Ken)

1. Go to https://resend.com and sign up with the business email you want to
   own this account.
2. Turn on two-factor sign-in for the account (Settings, Security).

## 2. Add the domain in Resend (Ken)

1. In Resend, open **Domains**, then **Add Domain**.
2. Domain: `onservice.ph`. Region: **Tokyo (ap-northeast-1)**, the closest to
   the Philippines.
3. Resend now shows a short list of DNS records. Keep that page open.

## 3. Add the records in GoDaddy (Ken)

In GoDaddy: **My Products**, then **DNS** next to `onservice.ph`, then
**Add New Record**. Add every record exactly as Resend shows it. It is usually
these three (the long values come from your Resend page):

| Type | Name | Value | Priority |
|---|---|---|---|
| TXT | `resend._domainkey` | the long `p=...` value from Resend | |
| MX | `send` | `feedback-smtp.ap-northeast-1.amazonses.com` (as shown) | 10 |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` (as shown) | |

Then add one more record, which Resend does not add for you:

| Type | Name | Value |
|---|---|---|
| TXT | `_dmarc` | `v=DMARC1; p=none;` |

Notes:

- GoDaddy adds `.onservice.ph` to the name by itself. Type only `send`, not
  `send.onservice.ph`.
- Do not change or delete any existing record.
- After a week of clean sending, the DMARC value can be tightened to
  `v=DMARC1; p=quarantine;`. Claude will remind you.

## 4. Verify the domain (Ken)

Back in Resend, press **Verify DNS Records**. It can take a few minutes, and
sometimes a few hours. When all records show **Verified**, continue.

In the domain's settings, leave **Click tracking** and **Open tracking**
**off**. Tracking links and pixels make sign-in emails look like marketing to
spam filters.

## 5. Create the sending key (Ken)

1. In Resend, open **API Keys**, then **Create API Key**.
2. Name: `onservice-server`. Permission: **Sending access**. Domain:
   `onservice.ph`.
3. Copy the key (it starts with `re_`). Resend shows it only once.
4. Paste it to Claude in chat. Claude puts it only in the server's `.env`
   file, never in code, GitHub or the app, and does not repeat it.

## 6. What Claude does next

1. Adds this block to the server's `.env` and restarts only the onService API:

   ```
   # ── Email sending: Resend (https://resend.com) — sign-in codes (D37) ──
   EMAIL_AUTH_DELIVERY_ENABLED=1
   RESEND_API_KEY=<the key from step 5>
   EMAIL_FROM=no-reply@onservice.ph
   EMAIL_FROM_NAME=onService PH
   EMAIL_CODE_SIGN_IN_ENABLED=1
   ```

2. Sends a real code to your Gmail and checks it lands in the inbox, not
   spam. Outlook and Yahoo too, if you have those inboxes.
3. Only then switches phone codes off (`PHONE_OTP_SIGN_IN_ENABLED=0`), so
   nobody is ever left without a way to sign in.
4. Switches admins to email codes (`ADMIN_SECOND_FACTOR=email`) only after
   each active admin account has a real inbox (see below).

## 7. Two answers Claude needs from Ken

- **Which real inbox should each admin account use?** Today every admin email
  is `@onservice.ph`, which has no mailboxes, so an emailed admin code could
  never arrive.
- **Test accounts:** every test account's email is `@onservice.ph` or
  `@test.ph`, and neither can receive mail. Either testers create fresh
  accounts with their own email, or tell Claude which real inbox belongs to
  which test account.

## Optional later

- A real mailbox such as `support@onservice.ph` (Google Workspace, Zoho Mail
  or similar) so customers can reply. Until then the code email says nothing
  about replying.
