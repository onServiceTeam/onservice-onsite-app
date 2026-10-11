/**
 * D37 (2026-10-11): the sign-in code email. Pure formatting, no I/O.
 *
 * Deliverability choices (keep them when editing):
 * - A plain-text part AND a simple HTML part. Spam filters distrust
 *   HTML-only mail.
 * - No images, no links, no tracking pixels. A short transactional message
 *   with one clear purpose.
 * - The code is NOT in the subject. The hidden preview line states the fixed
 *   expiry and is padded, so inbox lists and most notification previews show
 *   that line rather than running on into the code. (The plain-text part, used
 *   only by mail apps that cannot show HTML, keeps the code near the top.)
 * - The expiry is a fixed clock time, not a countdown. A resend inside the
 *   five-minute window carries the SAME code and the SAME expiry, so the
 *   message is identical and never claims a fresh five minutes.
 * - An unexpected ADMIN code means someone has that admin's password (the code
 *   is only sent after the right password), so that email says so.
 */

export type EmailCodePurpose = 'sign_in' | 'link_email' | 'admin_sign_in';

export interface EmailCodeMessage {
  subject: string;
  text: string;
  html: string;
}

const SUBJECTS: Record<EmailCodePurpose, string> = {
  sign_in: 'Your onService PH sign-in code',
  admin_sign_in: 'Your onService PH admin sign-in code',
  link_email: 'Confirm your onService PH sign-in email',
};

const LEADS: Record<EmailCodePurpose, string> = {
  sign_in: 'Use this code to sign in to onService PH:',
  admin_sign_in: 'Use this code to finish signing in to the onService PH admin console:',
  link_email: 'Use this code to add this email as a sign-in method for your onService PH account:',
};

/** e.g. "11:42 PM" in Philippine time. Asia/Manila has no daylight saving. */
export function formatManilaTime(at: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(at);
}

export function buildEmailCodeMessage(input: {
  code: string; purpose: EmailCodePurpose; expiresAt: Date; validMinutes: number;
  /** false (default) while no monitored reply address is configured. */
  replyMonitored?: boolean;
}): EmailCodeMessage {
  if (!/^\d{6}$/.test(input.code)) throw new Error('Email code must be six digits.');
  if (!Number.isInteger(input.validMinutes) || input.validMinutes < 1 || input.validMinutes > 10) {
    throw new Error('Email code validity must be 1 to 10 whole minutes.');
  }
  const subject = SUBJECTS[input.purpose];
  const lead = LEADS[input.purpose];
  const at = formatManilaTime(input.expiresAt);
  const minutes = `${input.validMinutes} minute${input.validMinutes === 1 ? '' : 's'}`;
  const expiry = `This code expires at ${at} Philippine time, ${minutes} after it was requested.`;
  const ignore = input.purpose === 'admin_sign_in'
    ? 'This code is only sent after the correct admin password. If you did not just sign in, someone has your password: change it now and tell a super admin.'
    : 'If you did not try to sign in, you can ignore this email. Your account is not changed.';
  const safety = 'Never share this code. onService PH staff will never ask you for it.';
  const noReply = input.replyMonitored ? '' : 'Please do not reply to this email. This address is not monitored.';
  const preview = `This code expires at ${at} Philippine time.`;
  // Invisible spacer characters so previews stop at the line above.
  const previewPad = '&#847;&zwnj;&nbsp;'.repeat(60);

  const text = [lead, input.code, expiry, ignore, safety, noReply, 'onService PH'].filter(Boolean).join('\n\n');

  // Table layout and inline styles: the forms every mail app renders the same.
  const font = "font-family:Arial,Helvetica,sans-serif;";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f5f9;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preview}${previewPad}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f5f9;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;">
<tr><td style="padding:28px 28px 4px;${font}font-size:20px;line-height:26px;font-weight:bold;color:#003D9B;">onService PH</td></tr>
<tr><td style="padding:12px 28px 4px;${font}font-size:16px;line-height:24px;color:#1f2937;">${lead}</td></tr>
<tr><td align="center" style="padding:18px 28px;">
<div style="display:inline-block;padding:14px 24px;border:2px solid #003D9B;border-radius:10px;background-color:#eef3fc;${font}font-size:40px;line-height:48px;font-weight:bold;letter-spacing:10px;color:#003D9B;">${input.code}</div>
</td></tr>
<tr><td style="padding:4px 28px;${font}font-size:15px;line-height:22px;color:#1f2937;"><strong>${expiry}</strong></td></tr>
<tr><td style="padding:16px 28px 4px;${font}font-size:14px;line-height:21px;color:#4b5563;">${ignore}</td></tr>
<tr><td style="padding:4px 28px ${noReply ? '4px' : '28px'};${font}font-size:14px;line-height:21px;color:#4b5563;">${safety}</td></tr>
${noReply ? `<tr><td style="padding:4px 28px 28px;${font}font-size:13px;line-height:20px;color:#6b7280;">${noReply}</td></tr>` : ''}
</table>
<p style="margin:16px 0 0;${font}font-size:12px;line-height:18px;color:#6b7280;">onService PH home services</p>
</td></tr>
</table>
</body>
</html>`;

  return { subject, text, html };
}
