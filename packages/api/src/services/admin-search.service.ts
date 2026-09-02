import { db } from '../models/db';
import { maskEmail, maskPhilippinePhone } from '../utils/pii-mask';

export type AdminSearchKind =
  | 'customer'
  | 'provider'
  | 'business'
  | 'contract'
  | 'booking'
  | 'statement'
  | 'support'
  | 'dispute'
  | 'payout';

interface RawSearchRow {
  id: string;
  title: string;
  context: string | null;
  status: string | null;
  phone: string | null;
  email: string | null;
  related_id: string | null;
  rank: string | number;
  created_at: Date;
}

export interface AdminSearchResult {
  kind: AdminSearchKind;
  id: string;
  title: string;
  subtitle: string;
  status: string | null;
  to: string;
}

interface RankedResult extends AdminSearchResult {
  rank: number;
  createdAt: number;
}

const PER_KIND_LIMIT = 4;
const TOTAL_LIMIT = 12;
const KIND_ORDER: Record<AdminSearchKind, number> = {
  customer: 0,
  provider: 1,
  business: 2,
  contract: 3,
  booking: 4,
  statement: 5,
  support: 6,
  dispute: 7,
  payout: 8,
};

function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function contactSummary(row: RawSearchRow): string[] {
  return [maskPhilippinePhone(row.phone), maskEmail(row.email)].filter(Boolean);
}

function normalizePhoneSearch(needle: string): string {
  const digits = needle.replace(/\D/g, '');
  if (digits.length < 4) return '';
  if (digits.startsWith('0')) return `63${digits.slice(1)}`;
  if (digits.startsWith('9')) return `63${digits}`;
  return digits;
}

function resultTitle(kind: AdminSearchKind, row: RawSearchRow): string {
  const reference = shortId(row.id);
  if (kind === 'booking') return `Booking ${reference}`;
  if (kind === 'contract') return `Contract ${reference}`;
  if (kind === 'dispute') return `Dispute ${reference}`;
  if (kind === 'payout') return `Payout ${reference}`;
  return row.title;
}

function resultDestination(kind: AdminSearchKind, row: RawSearchRow): string {
  const id = encodeURIComponent(row.id);
  const businessId = row.related_id ? encodeURIComponent(row.related_id) : null;
  if (kind === 'customer') return `/customers/${id}`;
  if (kind === 'provider') return `/providers/${id}`;
  if (kind === 'business') return `/business-accounts/${id}`;
  if (kind === 'contract') {
    return businessId
      ? `/business-accounts/${businessId}?tab=contracts&contractId=${id}`
      : '/business-accounts';
  }
  if (kind === 'booking') return `/bookings/${id}`;
  if (kind === 'statement') {
    return businessId
      ? `/business-accounts/${businessId}?tab=invoices&invoiceId=${id}`
      : '/business-accounts';
  }
  if (kind === 'support') return `/support-tickets?ticketId=${id}`;
  if (kind === 'dispute') return `/disputes/${id}`;
  return `/payouts?payoutId=${id}`;
}

function formatResult(kind: AdminSearchKind, row: RawSearchRow): RankedResult {
  const status = row.status?.replace(/_/g, ' ') ?? null;
  const contact = kind === 'customer' || kind === 'provider' || kind === 'business'
    ? contactSummary(row)
    : [];
  const subtitle = [row.context, status, ...contact].filter(Boolean).join(' · ');

  return {
    kind,
    id: row.id,
    title: resultTitle(kind, row),
    subtitle,
    status,
    to: resultDestination(kind, row),
    rank: Number(row.rank),
    createdAt: row.created_at.getTime(),
  };
}

/**
 * Bounded cross-entity operator search. Raw contact may be used as an input
 * match because the existing Customer/Provider/Support queues already support
 * that workflow. Exact payment evidence references may also locate their
 * statement. Raw contact and payment-reference text are never returned here;
 * every result carries masked contact at most and opens the canonical record
 * workspace.
 */
export async function searchAdminRecords(query: string): Promise<AdminSearchResult[]> {
  const needle = query.trim();
  const phoneDigits = normalizePhoneSearch(needle);
  const params = [needle, phoneDigits, PER_KIND_LIMIT];

  // Nine fixed, bounded queries are intentionally parallel. This is not a
  // record-driven query loop and cannot grow with the number of matches.
  const [customers, businesses, providers, contracts, bookings, statements, support, disputes, payouts] = await Promise.all([
    db.query<RawSearchRow>(
      `SELECT u.id::text AS id,
              TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS title,
              'Customer account'::text AS context,
              CASE WHEN u.is_active THEN 'active' ELSE 'inactive' END::text AS status,
              u.phone, u.email, NULL::text AS related_id,
              CASE
                WHEN LOWER(u.id::text) = LOWER($1) THEN 0
                WHEN LOWER(TRIM(CONCAT_WS(' ', u.first_name, u.last_name))) = LOWER($1) THEN 1
                WHEN LEFT(LOWER(u.id::text), LENGTH($1)) = LOWER($1) THEN 1
                ELSE 2
              END AS rank,
              u.updated_at AS created_at
         FROM users u
        WHERE u.role = 'customer'
          AND (
            STRPOS(LOWER(u.id::text), LOWER($1)) > 0
            OR STRPOS(LOWER(TRIM(CONCAT_WS(' ', u.first_name, u.last_name))), LOWER($1)) > 0
            OR STRPOS(LOWER(COALESCE(u.phone, '')), LOWER($1)) > 0
            OR STRPOS(LOWER(COALESCE(u.email, '')), LOWER($1)) > 0
            OR ($2 <> '' AND STRPOS(REGEXP_REPLACE(COALESCE(u.phone, ''), '\\D', '', 'g'), $2) > 0)
          )
        ORDER BY rank, u.updated_at DESC
        LIMIT $3`,
      params,
    ),
    db.query<RawSearchRow>(
      `SELECT ba.id::text AS id,
              ba.company_name AS title,
              CONCAT_WS(' · ',
                NULLIF(CONCAT_WS(', ', ba.city, ba.province), ''),
                'Contact ' || ba.contact_person
              ) AS context,
              ba.status::text AS status,
              ba.contact_phone AS phone, ba.contact_email AS email,
              ba.owner_user_id::text AS related_id,
              CASE
                WHEN LOWER(ba.id::text) = LOWER($1) THEN 0
                WHEN LOWER(ba.company_name) = LOWER($1)
                  OR LOWER(COALESCE(ba.registration_number, '')) = LOWER($1)
                  OR LOWER(COALESCE(ba.tax_id, '')) = LOWER($1) THEN 1
                WHEN LEFT(LOWER(ba.id::text), LENGTH($1)) = LOWER($1) THEN 1
                ELSE 2
              END AS rank,
              ba.updated_at AS created_at
         FROM business_accounts ba
         JOIN users owner ON owner.id = ba.owner_user_id
        WHERE STRPOS(LOWER(ba.id::text), LOWER($1)) > 0
           OR STRPOS(LOWER(ba.company_name), LOWER($1)) > 0
           OR STRPOS(LOWER(ba.contact_person), LOWER($1)) > 0
           OR STRPOS(LOWER(ba.contact_phone), LOWER($1)) > 0
           OR STRPOS(LOWER(ba.contact_email), LOWER($1)) > 0
           OR STRPOS(LOWER(COALESCE(ba.registration_number, '')), LOWER($1)) > 0
           OR STRPOS(LOWER(COALESCE(ba.tax_id, '')), LOWER($1)) > 0
           OR STRPOS(LOWER(owner.id::text), LOWER($1)) > 0
           OR STRPOS(LOWER(TRIM(CONCAT_WS(' ', owner.first_name, owner.last_name))), LOWER($1)) > 0
           OR STRPOS(LOWER(COALESCE(owner.phone, '')), LOWER($1)) > 0
           OR STRPOS(LOWER(COALESCE(owner.email, '')), LOWER($1)) > 0
           OR ($2 <> '' AND (
             STRPOS(REGEXP_REPLACE(ba.contact_phone, '\\D', '', 'g'), $2) > 0
             OR STRPOS(REGEXP_REPLACE(COALESCE(owner.phone, ''), '\\D', '', 'g'), $2) > 0
           ))
        ORDER BY rank, ba.updated_at DESC
        LIMIT $3`,
      params,
    ),
    db.query<RawSearchRow>(
      `SELECT p.id::text AS id,
              p.business_name AS title,
              NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), '') AS context,
              p.status::text AS status,
              u.phone, u.email, u.id::text AS related_id,
              CASE
                WHEN LOWER(p.id::text) = LOWER($1) OR LOWER(u.id::text) = LOWER($1) THEN 0
                WHEN LOWER(p.business_name) = LOWER($1) THEN 1
                WHEN LEFT(LOWER(p.id::text), LENGTH($1)) = LOWER($1) THEN 1
                ELSE 2
              END AS rank,
              p.updated_at AS created_at
         FROM providers p
         JOIN users u ON u.id = p.user_id
        WHERE STRPOS(LOWER(p.id::text), LOWER($1)) > 0
           OR STRPOS(LOWER(u.id::text), LOWER($1)) > 0
           OR STRPOS(LOWER(p.business_name), LOWER($1)) > 0
           OR STRPOS(LOWER(TRIM(CONCAT_WS(' ', u.first_name, u.last_name))), LOWER($1)) > 0
           OR STRPOS(LOWER(COALESCE(u.phone, '')), LOWER($1)) > 0
           OR STRPOS(LOWER(COALESCE(u.email, '')), LOWER($1)) > 0
           OR ($2 <> '' AND STRPOS(REGEXP_REPLACE(COALESCE(u.phone, ''), '\\D', '', 'g'), $2) > 0)
        ORDER BY rank, p.updated_at DESC
        LIMIT $3`,
      params,
    ),
    db.query<RawSearchRow>(
      `SELECT bc.id::text AS id,
              COALESCE(ss.name, sc.name, 'Contracted service') AS title,
              CONCAT_WS(' · ',
                ba.company_name,
                COALESCE(ss.name, sc.name, 'Contracted service'),
                COALESCE(p.business_name, 'Open provider pool')
              ) AS context,
              bc.status::text AS status,
              NULL::text AS phone, NULL::text AS email,
              ba.id::text AS related_id,
              CASE
                WHEN LOWER(bc.id::text) = LOWER($1) THEN 0
                WHEN LOWER(ba.company_name) = LOWER($1) THEN 1
                WHEN LEFT(LOWER(bc.id::text), LENGTH($1)) = LOWER($1) THEN 1
                ELSE 2
              END AS rank,
              bc.updated_at AS created_at
         FROM business_contracts bc
         JOIN business_accounts ba ON ba.id = bc.business_account_id
         JOIN service_categories sc ON sc.id = bc.category_id
         LEFT JOIN service_subcategories ss ON ss.id = bc.subcategory_id
         LEFT JOIN providers p ON p.id = bc.provider_id
        WHERE STRPOS(LOWER(bc.id::text), LOWER($1)) > 0
           OR STRPOS(LOWER(ba.id::text), LOWER($1)) > 0
           OR STRPOS(LOWER(ba.company_name), LOWER($1)) > 0
           OR STRPOS(LOWER(sc.name), LOWER($1)) > 0
           OR STRPOS(LOWER(COALESCE(ss.name, '')), LOWER($1)) > 0
           OR STRPOS(LOWER(COALESCE(p.business_name, '')), LOWER($1)) > 0
        ORDER BY rank, bc.updated_at DESC
        LIMIT $3`,
      params,
    ),
    db.query<RawSearchRow>(
      `SELECT b.id::text AS id,
              COALESCE(ss.name, sc.name, 'Booked service') AS title,
              CONCAT_WS(' · ',
                NULLIF(TRIM(CONCAT_WS(' ', cu.first_name, cu.last_name)), ''),
                COALESCE(p.business_name, 'Unassigned provider'),
                NULLIF(CONCAT_WS(', ', b.city, b.province), '')
              ) AS context,
              b.status::text AS status,
              NULL::text AS phone, NULL::text AS email,
              b.customer_id::text AS related_id,
              CASE
                WHEN LOWER(b.id::text) = LOWER($1) THEN 0
                WHEN LEFT(LOWER(b.id::text), LENGTH($1)) = LOWER($1) THEN 1
                ELSE 2
              END AS rank,
              b.updated_at AS created_at
         FROM bookings b
         JOIN users cu ON cu.id = b.customer_id
         LEFT JOIN providers p ON p.id = b.provider_id
         LEFT JOIN users pu ON pu.id = p.user_id
         LEFT JOIN service_categories sc ON sc.id = b.category_id
         LEFT JOIN service_subcategories ss ON ss.id = b.subcategory_id
        WHERE STRPOS(LOWER(b.id::text), LOWER($1)) > 0
           OR STRPOS(LOWER(cu.id::text), LOWER($1)) > 0
           OR STRPOS(LOWER(TRIM(CONCAT_WS(' ', cu.first_name, cu.last_name))), LOWER($1)) > 0
           OR STRPOS(LOWER(COALESCE(cu.phone, '')), LOWER($1)) > 0
           OR STRPOS(LOWER(COALESCE(cu.email, '')), LOWER($1)) > 0
           OR STRPOS(LOWER(COALESCE(p.id::text, '')), LOWER($1)) > 0
           OR STRPOS(LOWER(COALESCE(p.business_name, '')), LOWER($1)) > 0
           OR STRPOS(LOWER(TRIM(CONCAT_WS(' ', pu.first_name, pu.last_name))), LOWER($1)) > 0
           OR ($2 <> '' AND (
             STRPOS(REGEXP_REPLACE(COALESCE(cu.phone, ''), '\\D', '', 'g'), $2) > 0
             OR STRPOS(REGEXP_REPLACE(COALESCE(pu.phone, ''), '\\D', '', 'g'), $2) > 0
           ))
        ORDER BY rank, b.updated_at DESC
        LIMIT $3`,
      params,
    ),
    db.query<RawSearchRow>(
      `SELECT bi.id::text AS id,
              bi.invoice_number AS title,
              CONCAT_WS(' · ',
                ba.company_name,
                TO_CHAR(bi.billing_period_start, 'Mon DD, YYYY') || ' to '
                  || TO_CHAR(bi.billing_period_end, 'Mon DD, YYYY')
              ) AS context,
              bi.status::text AS status,
              NULL::text AS phone, NULL::text AS email,
              ba.id::text AS related_id,
              CASE
                WHEN LOWER(bi.id::text) = LOWER($1)
                  OR LOWER(bi.invoice_number) = LOWER($1)
                  OR LOWER(COALESCE(bi.payment_reference, '')) = LOWER($1)
                  OR EXISTS (
                    SELECT 1 FROM business_invoice_payments payment
                     WHERE payment.invoice_id = bi.id
                       AND LOWER(payment.external_reference) = LOWER($1)
                  ) THEN 0
                WHEN LOWER(ba.company_name) = LOWER($1)
                  OR LEFT(LOWER(bi.id::text), LENGTH($1)) = LOWER($1)
                  OR LEFT(LOWER(bi.invoice_number), LENGTH($1)) = LOWER($1) THEN 1
                ELSE 2
              END AS rank,
              bi.updated_at AS created_at
         FROM business_invoices bi
         JOIN business_accounts ba ON ba.id = bi.business_account_id
        WHERE STRPOS(LOWER(bi.id::text), LOWER($1)) > 0
           OR STRPOS(LOWER(bi.invoice_number), LOWER($1)) > 0
           OR STRPOS(LOWER(ba.id::text), LOWER($1)) > 0
           OR STRPOS(LOWER(ba.company_name), LOWER($1)) > 0
           OR LOWER(COALESCE(bi.payment_reference, '')) = LOWER($1)
           OR EXISTS (
             SELECT 1 FROM business_invoice_payments payment
              WHERE payment.invoice_id = bi.id
                AND LOWER(payment.external_reference) = LOWER($1)
           )
        ORDER BY rank, bi.updated_at DESC
        LIMIT $3`,
      params,
    ),
    db.query<RawSearchRow>(
      `SELECT st.id::text AS id,
              st.ticket_number AS title,
              CONCAT_WS(' · ', st.subject, NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), '')) AS context,
              st.status::text AS status,
              NULL::text AS phone, NULL::text AS email,
              st.user_id::text AS related_id,
              CASE
                WHEN LOWER(st.id::text) = LOWER($1) OR LOWER(st.ticket_number) = LOWER($1) THEN 0
                WHEN LEFT(LOWER(st.ticket_number), LENGTH($1)) = LOWER($1) THEN 1
                ELSE 2
              END AS rank,
              st.updated_at AS created_at
         FROM support_tickets st
         JOIN users u ON u.id = st.user_id
         LEFT JOIN providers p ON p.user_id = u.id
        WHERE STRPOS(LOWER(st.id::text), LOWER($1)) > 0
           OR STRPOS(LOWER(st.ticket_number), LOWER($1)) > 0
           OR STRPOS(LOWER(st.subject), LOWER($1)) > 0
           OR STRPOS(LOWER(TRIM(CONCAT_WS(' ', u.first_name, u.last_name))), LOWER($1)) > 0
           OR STRPOS(LOWER(COALESCE(u.phone, '')), LOWER($1)) > 0
           OR STRPOS(LOWER(COALESCE(u.email, '')), LOWER($1)) > 0
           OR STRPOS(LOWER(COALESCE(p.business_name, '')), LOWER($1)) > 0
           OR ($2 <> '' AND STRPOS(REGEXP_REPLACE(COALESCE(u.phone, ''), '\\D', '', 'g'), $2) > 0)
        ORDER BY rank, st.updated_at DESC
        LIMIT $3`,
      params,
    ),
    db.query<RawSearchRow>(
      `SELECT d.id::text AS id,
              d.id::text AS title,
              CONCAT_WS(' · ',
                'Booking ' || LEFT(b.id::text, 8),
                NULLIF(TRIM(CONCAT_WS(' ', cu.first_name, cu.last_name)), ''),
                COALESCE(p.business_name, 'Unassigned provider')
              ) AS context,
              d.status::text AS status,
              NULL::text AS phone, NULL::text AS email,
              b.id::text AS related_id,
              CASE
                WHEN LOWER(d.id::text) = LOWER($1) THEN 0
                WHEN LOWER(b.id::text) = LOWER($1) THEN 1
                WHEN LEFT(LOWER(d.id::text), LENGTH($1)) = LOWER($1) THEN 1
                ELSE 2
              END AS rank,
              d.updated_at AS created_at
         FROM disputes d
         JOIN bookings b ON b.id = d.booking_id
         JOIN users cu ON cu.id = b.customer_id
         LEFT JOIN providers p ON p.id = b.provider_id
         LEFT JOIN users pu ON pu.id = p.user_id
        WHERE STRPOS(LOWER(d.id::text), LOWER($1)) > 0
           OR STRPOS(LOWER(b.id::text), LOWER($1)) > 0
           OR STRPOS(LOWER(cu.id::text), LOWER($1)) > 0
           OR STRPOS(LOWER(TRIM(CONCAT_WS(' ', cu.first_name, cu.last_name))), LOWER($1)) > 0
           OR STRPOS(LOWER(COALESCE(p.id::text, '')), LOWER($1)) > 0
           OR STRPOS(LOWER(COALESCE(p.business_name, '')), LOWER($1)) > 0
           OR ($2 <> '' AND (
             STRPOS(REGEXP_REPLACE(COALESCE(cu.phone, ''), '\\D', '', 'g'), $2) > 0
             OR STRPOS(REGEXP_REPLACE(COALESCE(pu.phone, ''), '\\D', '', 'g'), $2) > 0
           ))
        ORDER BY rank, d.updated_at DESC
        LIMIT $3`,
      params,
    ),
    db.query<RawSearchRow>(
      `SELECT po.id::text AS id,
              po.id::text AS title,
              p.business_name AS context,
              po.status::text AS status,
              NULL::text AS phone, NULL::text AS email,
              p.id::text AS related_id,
              CASE
                WHEN LOWER(po.id::text) = LOWER($1) THEN 0
                WHEN LOWER(COALESCE(po.paymongo_transfer_id, '')) = LOWER($1) THEN 0
                WHEN LOWER(p.id::text) = LOWER($1) THEN 1
                WHEN LEFT(LOWER(po.id::text), LENGTH($1)) = LOWER($1) THEN 1
                ELSE 2
              END AS rank,
              po.created_at AS created_at
         FROM payouts po
         JOIN providers p ON p.id = po.provider_id
         JOIN users u ON u.id = p.user_id
        WHERE STRPOS(LOWER(po.id::text), LOWER($1)) > 0
           OR STRPOS(LOWER(COALESCE(po.paymongo_transfer_id, '')), LOWER($1)) > 0
           OR STRPOS(LOWER(p.id::text), LOWER($1)) > 0
           OR STRPOS(LOWER(p.business_name), LOWER($1)) > 0
           OR STRPOS(LOWER(TRIM(CONCAT_WS(' ', u.first_name, u.last_name))), LOWER($1)) > 0
           OR STRPOS(LOWER(COALESCE(u.phone, '')), LOWER($1)) > 0
           OR STRPOS(LOWER(COALESCE(u.email, '')), LOWER($1)) > 0
           OR ($2 <> '' AND STRPOS(REGEXP_REPLACE(COALESCE(u.phone, ''), '\\D', '', 'g'), $2) > 0)
        ORDER BY rank, po.created_at DESC
        LIMIT $3`,
      params,
    ),
  ]);

  const ranked = [
    ...customers.rows.map((row) => formatResult('customer', row)),
    ...providers.rows.map((row) => formatResult('provider', row)),
    ...businesses.rows.map((row) => formatResult('business', row)),
    ...contracts.rows.map((row) => formatResult('contract', row)),
    ...bookings.rows.map((row) => formatResult('booking', row)),
    ...statements.rows.map((row) => formatResult('statement', row)),
    ...support.rows.map((row) => formatResult('support', row)),
    ...disputes.rows.map((row) => formatResult('dispute', row)),
    ...payouts.rows.map((row) => formatResult('payout', row)),
  ].sort((left, right) => (
    left.rank - right.rank
    || KIND_ORDER[left.kind] - KIND_ORDER[right.kind]
    || right.createdAt - left.createdAt
  ));

  return ranked.slice(0, TOTAL_LIMIT).map(({ rank: _rank, createdAt: _createdAt, ...result }) => result);
}
