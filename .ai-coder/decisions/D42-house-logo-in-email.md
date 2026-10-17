# D42: The house logo in emails

**Date:** 2026-10-18
**Asked by:** Claude, during the house-logo job (a brand review finding on that job).
**Status:** OPEN. Waiting on Ken. Nothing is blocked by it: email sign-in is still switched off on the tester server until Ken sets up Resend and the GoDaddy email records (D37), so no tester receives this email today.

## The question

Ken decided on 2026-10-14 that the onService PH logo is the house, the same everywhere, and he named emails. The sign-in code email is the only HTML email the app sends (`packages/api/src/services/email-code-message.ts`, used for customer sign-in, admin sign-in and adding a sign-in email). At the top it shows the words "onService PH" in bold brand blue `#003D9B`, one colour. It has no house tile.

Should the email show the house tile, and if so, how?

## Why this is not a simple change

- The email was built under D37 with no images, no links and no tracking pixels, so it lands in the inbox and not in spam (Ken's D37 requirement: "landing in the inbox, not spam"). That rule is in the file's header (lines 4 to 8) and a test pins it (`packages/api/__tests__/email-code-message.test.ts`, the first test: the HTML must not contain `<img`, `<a ` or a web address).
- Gmail and Outlook do not show SVG drawings inside an email, and most mail apps block pictures written straight into the HTML (`data:` images). A house built from table cells or CSS shapes does not work in desktop Outlook and could never match the real house drawing.
- So the house can only reach an email as a picture file: either carried inside the email itself, or loaded from our server when the email is opened.
- The older sign-in email (`sendEmailVerificationCode` in `packages/api/src/services/email-code-delivery.service.ts`) is plain text and switched off. Plain text cannot carry any logo.

## Options

**(a) Keep the text wordmark only in email, as the one recorded exception to "the house everywhere". Recommended for now.**
- What it is today: bold `#003D9B` "onService PH", one colour, no "oS" letters, no orange. A test pins this (`D37 guard (house logo, 2026-10-14)` in `email-code-message.test.ts`).
- Cost: none.
- Downside: the email has no house.

**(b) Put a small picture of the blue tile inside the email itself (an "inline" or "CID" image).**
- Checked on 2026-10-18 in Resend's own documentation (resend.com/docs/dashboard/emails/embed-inline-images): Resend supports this. The picture goes in as an attachment with a `content_id`, and the email's HTML points at it with `cid:`.
- Caveats from the same page: some mail apps, "especially webmail", may refuse inline pictures; each email gets bigger; it does not work with Resend's batch sending (we do not use batch).
- Not tested by us: there is no Resend account yet, so nobody has seen where such an email lands.
- No new package is needed. The existing request to Resend would gain an attachments field, and a 96 x 96 PNG of the blue tile would be drawn from the same masters as the other icons.
- Cost: a small code change, plus a new inbox test at Gmail, Outlook and Yahoo.

**(c) Load the picture from our server when the email is opened (a "hosted" image).**
- It breaks D37's no-image, no-link rule.
- Many mail apps hide outside pictures until the reader allows them, so many people would see an empty box instead of the logo.
- Loading the picture tells our server when an email was opened, which works like a tracking pixel.
- Not recommended.

## Recommendation

(a) now. Look at (b) again when Ken sets up Resend, as part of the real inbox test D37 already asks for, so we can compare where the email lands with and without the picture. Ken decides; Claude will not change the email until he does.

## Related: PDFs

Ken's decision also covers PDFs. None of the three PDFs the server makes carries any logo today, so there is no "oS" to replace:

- The Official Receipt and the BIR 2307 form are left exactly as they are. Changing a receipt registered with BIR is a compliance hard stop for Ken and an accountant.
- The internal VAT report is a working paper for the books. It is left alone too. If Ken wants the house on it, it can be drawn from the same house path inside the PDF, with no image file.

## Where this is recorded

- `docs/design-system/brand/README.md`, section "Where the house does not go (yet)".
- The test comment in `packages/api/__tests__/email-code-message.test.ts` and the header of `packages/api/src/services/email-code-message.ts` point here.

## Answer

(None yet.)
