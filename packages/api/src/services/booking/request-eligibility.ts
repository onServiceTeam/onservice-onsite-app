/**
 * D38 (Ken, 2026-10-13; Milestone 2 plan, merged.md P2 algorithm 1.5, critique
 * L8): one SQL rule for "may this provider take this quote request". Quote
 * admission (booking.service submitQuoteInTransaction), the provider request
 * list and detail (job-leads.service), the fan-out (job-leads.service) and the
 * read-only commission preview (booking-financial-terms.service) all use this
 * fragment, so a provider can never be shown a request they cannot quote on,
 * or be admitted to one they could not see.
 *
 * A provider is eligible for a request when ALL of these hold:
 *   - they have an active service in the request's category, directly or
 *     through a subcategory of it (provider_services.category_id is nullable,
 *     migration 013);
 *   - both the request and the provider have map coordinates. Before D38 a
 *     provider with no coordinates matched every request in their category.
 *     With first-response exclusivity such a provider could lock a request
 *     they cannot reach, so they are no longer eligible;
 *   - the request lies inside the provider's own service radius;
 *   - the provider is not the customer who posted the request.
 *
 * Account status and the online switch are NOT part of the rule: each caller
 * adds its own status check, and only the fan-out requires is_available.
 *
 * Leaf module with no imports. The aliases are fixed internal identifiers,
 * never user input.
 */

export interface RequestEligibilityAliases {
  /** Alias of the bookings row (the request). */
  booking: string;
  /** Alias of the providers row. */
  provider: string;
}

const DEFAULT_ALIASES: RequestEligibilityAliases = { booking: 'b', provider: 'p' };
const SQL_ALIAS = /^[a-z_][a-z0-9_]*$/;

function checkedAliases(aliases: RequestEligibilityAliases): RequestEligibilityAliases {
  if (!SQL_ALIAS.test(aliases.booking) || !SQL_ALIAS.test(aliases.provider)) {
    throw new Error('Request eligibility aliases must be plain SQL identifiers.');
  }
  return aliases;
}

/** Great-circle distance in km between the request and the provider (both must have coordinates). */
export function requestDistanceKmSql(aliases: RequestEligibilityAliases = DEFAULT_ALIASES): string {
  const { booking: b, provider: p } = checkedAliases(aliases);
  return `(6371 * acos(LEAST(1.0, GREATEST(-1.0,
      cos(radians(${b}.latitude::numeric)) * cos(radians(${p}.latitude::numeric))
        * cos(radians(${p}.longitude::numeric) - radians(${b}.longitude::numeric))
      + sin(radians(${b}.latitude::numeric)) * sin(radians(${p}.latitude::numeric))
    ))))`;
}

/** Boolean SQL expression: the provider row may take the request row. */
export function providerEligibleForRequestSql(aliases: RequestEligibilityAliases = DEFAULT_ALIASES): string {
  const { booking: b, provider: p } = checkedAliases(aliases);
  return `(
    EXISTS (
      SELECT 1
        FROM provider_services eligible_ps
        LEFT JOIN service_subcategories eligible_ssc ON eligible_ssc.id = eligible_ps.subcategory_id
       WHERE eligible_ps.provider_id = ${p}.id
         AND eligible_ps.is_active = TRUE
         AND (eligible_ps.category_id = ${b}.category_id OR eligible_ssc.category_id = ${b}.category_id)
    )
    AND ${b}.latitude IS NOT NULL AND ${b}.longitude IS NOT NULL
    AND ${p}.latitude IS NOT NULL AND ${p}.longitude IS NOT NULL
    AND ${requestDistanceKmSql(aliases)} <= COALESCE(${p}.service_radius_km, 1000000)
    AND ${p}.user_id <> ${b}.customer_id
  )`;
}
