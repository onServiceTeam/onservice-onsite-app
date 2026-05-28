/**
 * Phase 14 Dispatch 08 — PII masking utility.
 * Bugs 66, 75, 76, 81, 287, 311, 331, 342, 343, 350.
 *
 * Pre-D08 the admin UI showed raw PII (IP addresses, user-agents, embedded
 * customer phone/email) to every admin role. NPC RA 10173 requires
 * least-privilege exposure: only super_admin sees raw PII; DPO sees
 * partially masked; all other roles see fully masked.
 *
 * Reveal action (Bug 81): super_admin can request a one-row reveal via
 * POST /admin/audit-log/:id/reveal-pii — the reveal itself is audit-logged
 * with action_type='pii_reveal'. The reveal endpoint lives in
 * routes/admin-audit-log.routes.ts (or wherever the audit log GET lives).
 */

export type ActorRole =
  | 'super_admin'
  | 'dpo'
  | 'admin'
  | 'finance'
  | 'support'
  | 'dispatcher'
  | 'moderator'
  | 'support_agent'
  | string;

export function maskIp(ip: string | null | undefined): string {
  if (!ip) return '';
  // IPv6: keep first 4 groups
  if (ip.includes(':')) {
    const groups = ip.split(':');
    return groups.slice(0, 4).filter(Boolean).join(':') + ':****';
  }
  // IPv4: keep first 3 octets
  const octets = ip.split('.');
  if (octets.length !== 4) return 'masked';
  return `${octets[0]}.${octets[1]}.${octets[2]}.***`;
}

export function maskUserAgent(ua: string | null | undefined): string {
  if (!ua) return '';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Edge') || ua.includes('Edg/')) return 'Edge';
  if (ua.toLowerCase().includes('expo') || ua.includes('OnServicePH')) {
    if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) return 'Mobile (iOS)';
    if (ua.includes('Android')) return 'Mobile (Android)';
    return 'Mobile app';
  }
  return 'Other';
}

const PHONE_REGEX = /(\+?63)?\s?9\d{2}\s?\d{3}\s?\d{4}/g;
const EMAIL_REGEX = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;

export function maskPhilippinePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  // Format: +63 9XX XXX 1234 — keep last 4 digits, mask middle
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return 'masked';
  const last4 = digits.slice(-4);
  return `+63 9XX XXX ${last4}`;
}

export function maskEmail(email: string | null | undefined): string {
  if (!email) return '';
  const at = email.indexOf('@');
  if (at < 1) return 'masked';
  const name = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${name[0]}•••@${domain}`;
}

export function maskPiiInString(s: string): string {
  return s
    .replace(PHONE_REGEX, (m) => {
      const digits = m.replace(/\D/g, '');
      const last4 = digits.slice(-4);
      return `+63 9XX XXX ${last4}`;
    })
    .replace(EMAIL_REGEX, (m) => {
      const at = m.indexOf('@');
      if (at < 1) return m;
      return `${m[0]}•••@${m.slice(at + 1)}`;
    });
}

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export function maskPiiInObject<T extends Json>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') {
    if (typeof obj === 'string') return maskPiiInString(obj) as T;
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((v) => maskPiiInObject(v as Json)) as T;
  }
  const out: Record<string, Json> = {};
  for (const [k, v] of Object.entries(obj as Record<string, Json>)) {
    if (k === 'ip_address' || k === 'ipAddress' || k === 'ip') {
      out[k] = typeof v === 'string' ? maskIp(v) : v;
    } else if (k === 'user_agent' || k === 'userAgent' || k === 'ua') {
      out[k] = typeof v === 'string' ? maskUserAgent(v) : v;
    } else if (k === 'phone' || k === 'phoneNumber' || k === 'phone_number') {
      out[k] = typeof v === 'string' ? maskPhilippinePhone(v) : v;
    } else if (k === 'email' || k === 'emailAddress' || k === 'email_address') {
      out[k] = typeof v === 'string' ? maskEmail(v) : v;
    } else if (typeof v === 'object' && v !== null) {
      out[k] = maskPiiInObject(v as Json);
    } else if (typeof v === 'string') {
      out[k] = maskPiiInString(v);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

export interface PiiBearingRow {
  ip_address?: string | null;
  user_agent?: string | null;
  phone?: string | null;
  email?: string | null;
  details?: Record<string, unknown> | null;
}

/**
 * Apply role-aware PII masking to a row before sending to the client.
 * - super_admin: raw (audit the read with action_type='pii_reveal' if reveal endpoint).
 * - dpo: raw IP for compliance investigations, masked UA, masked phone/email.
 * - all other admin roles: fully masked.
 */
export function maskPiiForRole<T extends PiiBearingRow>(row: T, role: ActorRole): T {
  if (role === 'super_admin') return row;

  const out: T = { ...row };

  if (role === 'dpo') {
    // Keep IP for compliance investigations; mask everything else.
    if (out.user_agent !== undefined) out.user_agent = maskUserAgent(out.user_agent);
    if (out.phone !== undefined) out.phone = maskPhilippinePhone(out.phone);
    if (out.email !== undefined) out.email = maskEmail(out.email);
    if (out.details) {
      out.details = maskPiiInObject(out.details as Json) as typeof out.details;
    }
    return out;
  }

  // Default: full masking for support, dispatcher, finance, moderator, admin, etc.
  if (out.ip_address !== undefined) out.ip_address = maskIp(out.ip_address);
  if (out.user_agent !== undefined) out.user_agent = maskUserAgent(out.user_agent);
  if (out.phone !== undefined) out.phone = maskPhilippinePhone(out.phone);
  if (out.email !== undefined) out.email = maskEmail(out.email);
  if (out.details) {
    out.details = maskPiiInObject(out.details as Json) as typeof out.details;
  }
  return out;
}
