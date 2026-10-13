/**
 * D38 quote slots (Milestone 2 plan, merged.md P2 algorithms 1.8 and 3, with
 * the critique.md H1, H4 and M2 corrections; escalation E83).
 *
 * A provider's quote carries the earliest date (a calendar date in the
 * platform time zone, platformConfig.timezone = Asia/Manila) and a time
 * window. Every time below is read from the DATABASE clock (clock_timestamp()
 * after the row locks), never the API server's clock.
 *
 *   window      local start   local end
 *   morning     08:00         12:00
 *   afternoon   12:00         17:00
 *   evening     17:00         21:00
 *   asap        (none)        21:00   (today only)
 *
 * Admission (a provider sends a quote):
 *   - the date is today to today + 30 in the platform zone;
 *   - asap only for today;
 *   - the slot must still be bookable: dbNow + lead < slotEnd, where lead is
 *     request_slot_lead_minutes;
 *   - the quote expires at LEAST(dbNow + quote_expiry_hours, slotEnd - lead),
 *     so a quote whose slot can no longer be confirmed lapses and frees the
 *     request (critique M2).
 *
 * Acceptance (the customer confirms; money-path timing, E83 interim default):
 *   earliest = dbNow + lead
 *   no slot (a quote sent before D38):  GREATEST(scheduled_at, earliest)
 *   earliest >= slotEnd:                409 QUOTE_SLOT_PASSED, before any write
 *   asap:                               earliest
 *   otherwise:                          GREATEST(slotStart, earliest)
 * The job time is a moment; the window is stored next to it
 * (bookings.scheduled_window) so screens and staff can show the promise.
 */
import { platformConfig } from '../../config/platform.config';
import { createAppError, type AppError } from '../../middleware/error.middleware';

export const QUOTE_TIME_WINDOWS = ['morning', 'afternoon', 'evening', 'asap'] as const;
export type QuoteTimeWindow = typeof QUOTE_TIME_WINDOWS[number];

/** Local start and end (HH:MM) of each window. ASAP has no start. */
export const QUOTE_WINDOW_HOURS: Readonly<Record<QuoteTimeWindow, { start: string | null; end: string }>> = {
  morning: { start: '08:00', end: '12:00' },
  afternoon: { start: '12:00', end: '17:00' },
  evening: { start: '17:00', end: '21:00' },
  asap: { start: null, end: '21:00' },
};

/** The furthest earliest date a provider may offer, in days after today. */
export const QUOTE_SLOT_MAX_DAYS_AHEAD = 30;

export function isQuoteTimeWindow(value: unknown): value is QuoteTimeWindow {
  return typeof value === 'string' && (QUOTE_TIME_WINDOWS as readonly string[]).includes(value);
}

interface SqlClient {
  query: <T extends import('pg').QueryResultRow = import('pg').QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<import('pg').QueryResult<T>>;
}

/** Times for one slot, all from the database clock. */
export interface QuoteSlotTimes {
  /** clock_timestamp() at the read. */
  dbNow: Date;
  /** earliest date minus today in the platform zone; null when no date. */
  dayOffset: number | null;
  /** Window start; null for asap or no slot. */
  slotStart: Date | null;
  /** Window end; null when no slot. */
  slotEnd: Date | null;
}

function boundSql(dateParam: string, windowParam: string, zoneParam: string, which: 'start' | 'end'): string {
  const branches = QUOTE_TIME_WINDOWS
    .map((window) => {
      const hhmm = QUOTE_WINDOW_HOURS[window][which];
      return hhmm === null ? null : `WHEN '${window}' THEN (${dateParam} + TIME '${hhmm}') AT TIME ZONE ${zoneParam}`;
    })
    .filter((branch): branch is string => branch !== null)
    .join(' ');
  return `(CASE ${windowParam} ${branches} END)`;
}

/**
 * Read the database clock and the slot bounds in one statement. Call it after
 * taking the row locks, so a lock wait never makes the clock stale.
 */
export async function readQuoteSlotTimes(
  client: SqlClient,
  earliestDate: string | null,
  window: string | null,
): Promise<QuoteSlotTimes> {
  const result = await client.query<{
    db_now: Date;
    day_offset: number | null;
    slot_start: Date | null;
    slot_end: Date | null;
  }>(
    `SELECT clock_timestamp() AS db_now,
            ($1::date - (clock_timestamp() AT TIME ZONE $3::text)::date) AS day_offset,
            ${boundSql('$1::date', '$2::text', '$3::text', 'start')} AS slot_start,
            ${boundSql('$1::date', '$2::text', '$3::text', 'end')} AS slot_end`,
    [earliestDate, window, platformConfig.timezone],
  );
  const row = result.rows[0]!;
  return {
    dbNow: new Date(row.db_now),
    dayOffset: row.day_offset === null ? null : Number(row.day_offset),
    slotStart: row.slot_start === null ? null : new Date(row.slot_start),
    slotEnd: row.slot_end === null ? null : new Date(row.slot_end),
  };
}

function minutes(value: number): number {
  return value * 60 * 1000;
}

function slotError(message: string, statusCode: number, code: string): AppError {
  return Object.assign(createAppError(message, statusCode), { code });
}

/** Admission check for a provider's slot. Throws 400 QUOTE_SLOT_INVALID. */
export function assertQuoteSlotAdmissible(
  times: QuoteSlotTimes,
  window: QuoteTimeWindow,
  leadMinutes: number,
): void {
  if (times.dayOffset === null || times.slotEnd === null) {
    throw slotError('Choose the earliest date and time window you can start.', 400, 'QUOTE_SLOT_INVALID');
  }
  if (times.dayOffset < 0 || times.dayOffset > QUOTE_SLOT_MAX_DAYS_AHEAD) {
    throw slotError(
      `Choose an earliest date from today up to ${QUOTE_SLOT_MAX_DAYS_AHEAD} days ahead.`,
      400,
      'QUOTE_SLOT_INVALID',
    );
  }
  if (window === 'asap' && times.dayOffset !== 0) {
    throw slotError('ASAP can only be chosen for today.', 400, 'QUOTE_SLOT_INVALID');
  }
  if (times.dbNow.getTime() + minutes(leadMinutes) >= times.slotEnd.getTime()) {
    throw slotError(
      'That time window ends too soon for the customer to confirm. Choose a later window or date.',
      400,
      'QUOTE_SLOT_INVALID',
    );
  }
}

/** A new quote's expiry: LEAST(dbNow + expiryHours, slotEnd - lead). */
export function quoteExpiresAt(times: QuoteSlotTimes, expiryHours: number, leadMinutes: number): Date {
  const byLifetime = times.dbNow.getTime() + expiryHours * 60 * 60 * 1000;
  if (times.slotEnd === null) return new Date(byLifetime);
  return new Date(Math.min(byLifetime, times.slotEnd.getTime() - minutes(leadMinutes)));
}

export interface ResolvedQuoteSchedule {
  scheduledAt: Date;
  /** The quote's window, or null for a quote sent without a slot. */
  scheduledWindow: QuoteTimeWindow | null;
}

/**
 * The job time a confirmed quote gets (E83 interim default). Throws 409
 * QUOTE_SLOT_PASSED when the slot can no longer start in time; the caller
 * must call this before any write.
 */
export function resolveQuoteScheduledAt(input: {
  window: string | null;
  slotStart: Date | null;
  slotEnd: Date | null;
  /** The booking's current job time (used only for a quote with no slot). */
  scheduledAt: Date;
  dbNow: Date;
  leadMinutes: number;
}): ResolvedQuoteSchedule {
  const earliest = input.dbNow.getTime() + minutes(input.leadMinutes);
  if (!isQuoteTimeWindow(input.window) || input.slotEnd === null) {
    return {
      scheduledAt: new Date(Math.max(new Date(input.scheduledAt).getTime(), earliest)),
      scheduledWindow: null,
    };
  }
  if (earliest >= input.slotEnd.getTime()) {
    throw slotError(
      'The time this pro offered has passed. Message the pro to agree a new time, or decline the quote.',
      409,
      'QUOTE_SLOT_PASSED',
    );
  }
  if (input.window === 'asap' || input.slotStart === null) {
    return { scheduledAt: new Date(earliest), scheduledWindow: input.window };
  }
  return {
    scheduledAt: new Date(Math.max(input.slotStart.getTime(), earliest)),
    scheduledWindow: input.window,
  };
}
