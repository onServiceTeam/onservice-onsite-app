/**
 * D27 Phase 7 — provider CRM (first slice): the provider's client book.
 *
 * Aggregates a provider's own bookings by customer so they can see repeat
 * clients, when they last served them, and the total job value. This is a
 * read-only view over data the provider already sees per booking — no new PII
 * exposure (these are the provider's own customers). The broader "value-added
 * per category" CRM tooling is a Ken decision: D27p7-provider-crm.md.
 */
import { db } from '../models/db';

// Bookings that represent real served work (used for the "completed" count).
const COMPLETED_STATUSES = ['confirmed', 'payout_ready', 'paid_out', 'completed_by_provider'];

export interface ProviderClientResult {
  customerId: string;
  customerName: string;
  jobCount: number;
  completedCount: number;
  lastJobAt: string | null;
  totalJobValue: number;
}

/**
 * One row per distinct customer the provider has had a booking with, most
 * recently served first. totalJobValue is the gross service price summed across
 * their bookings (NOT the provider's net of commission), labelled as such on the
 * client.
 */
export async function getProviderClients(providerId: string): Promise<ProviderClientResult[]> {
  const r = await db.query<{
    customer_id: string;
    first_name: string;
    last_name: string;
    job_count: string;
    completed_count: string;
    last_job_at: Date | null;
    total_job_value: string | null;
  }>(
    `SELECT b.customer_id,
            u.first_name, u.last_name,
            COUNT(*)::text AS job_count,
            COUNT(*) FILTER (WHERE b.status = ANY($2))::text AS completed_count,
            MAX(b.created_at) AS last_job_at,
            COALESCE(SUM(b.service_price), 0)::text AS total_job_value
       FROM bookings b
       JOIN users u ON u.id = b.customer_id
      WHERE b.provider_id = $1
      GROUP BY b.customer_id, u.first_name, u.last_name
      ORDER BY MAX(b.created_at) DESC
      LIMIT 300`,
    [providerId, COMPLETED_STATUSES],
  );

  return r.rows.map((row) => ({
    customerId: row.customer_id,
    customerName: `${row.first_name} ${row.last_name}`.trim(),
    jobCount: Number(row.job_count),
    completedCount: Number(row.completed_count),
    lastJobAt: row.last_job_at ? row.last_job_at.toISOString() : null,
    totalJobValue: Number(row.total_job_value ?? 0),
  }));
}
