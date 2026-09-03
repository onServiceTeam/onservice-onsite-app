import { createAppError } from '../middleware/error.middleware';

export type AuditTimelineSource = 'audit_log' | 'admin_actions';

export interface AuditTimelineFilters {
  entryId?: string;
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  source?: AuditTimelineSource;
  from?: string;
  to?: string;
}

export interface AuditTimelineListQuery extends AuditTimelineFilters {
  page: number;
  pageSize: number;
}

export interface AuditTimelineExportQuery extends AuditTimelineFilters {
  limit?: number;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENTITY_TYPE_REGEX = /^[a-z][a-z0-9_]{0,49}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const SOURCES: ReadonlySet<string> = new Set(['audit_log', 'admin_actions']);

function optionalString(
  query: Record<string, unknown>,
  key: string,
  maxLength: number,
): string | undefined {
  const value = query[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw createAppError(`${key} must be a single string.`, 400);
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > maxLength) {
    throw createAppError(`${key} cannot exceed ${maxLength} characters.`, 400);
  }
  return trimmed;
}

function positiveInteger(
  query: Record<string, unknown>,
  key: string,
  fallback: number | undefined,
  maximum: number,
): number | undefined {
  const value = query[key];
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw createAppError(`${key} must be a positive integer.`, 400);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw createAppError(`${key} must be a positive integer no greater than ${maximum}.`, 400);
  }
  return parsed;
}

function validCalendarDate(value: string): boolean {
  if (!DATE_REGEX.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month! - 1
    && date.getUTCDate() === day;
}

export function parseAuditTimelineFilters(query: Record<string, unknown>): AuditTimelineFilters {
  const entryId = optionalString(query, 'entryId', 36);
  if (entryId && !UUID_REGEX.test(entryId)) {
    throw createAppError('entryId must be a valid UUID.', 400);
  }

  const userId = optionalString(query, 'userId', 36);
  if (userId && !UUID_REGEX.test(userId)) {
    throw createAppError('userId must be a valid UUID.', 400);
  }

  const entityId = optionalString(query, 'entityId', 36);
  if (entityId && !UUID_REGEX.test(entityId)) {
    throw createAppError('entityId must be a valid UUID.', 400);
  }

  const action = optionalString(query, 'action', 100);
  const entityType = optionalString(query, 'entityType', 50);
  if (entityType && !ENTITY_TYPE_REGEX.test(entityType)) {
    throw createAppError('entityType must be a lowercase audit entity slug.', 400);
  }

  const sourceRaw = optionalString(query, 'source', 20);
  if (sourceRaw && !SOURCES.has(sourceRaw)) {
    throw createAppError('source must be audit_log or admin_actions.', 400);
  }
  if (entryId && !sourceRaw) {
    throw createAppError('source is required when entryId is provided.', 400);
  }

  const from = optionalString(query, 'from', 10);
  const to = optionalString(query, 'to', 10);
  if (from && !validCalendarDate(from)) {
    throw createAppError('from must be a valid YYYY-MM-DD date.', 400);
  }
  if (to && !validCalendarDate(to)) {
    throw createAppError('to must be a valid YYYY-MM-DD date.', 400);
  }
  if (from && to && from > to) {
    throw createAppError('from must be before or equal to to.', 400);
  }

  return {
    entryId: entryId?.toLowerCase(),
    userId: userId?.toLowerCase(),
    action,
    entityType,
    entityId: entityId?.toLowerCase(),
    source: sourceRaw as AuditTimelineSource | undefined,
    from,
    to,
  };
}

export function parseAuditTimelineListQuery(query: Record<string, unknown>): AuditTimelineListQuery {
  return {
    ...parseAuditTimelineFilters(query),
    page: positiveInteger(query, 'page', 1, 1_000_000)!,
    pageSize: positiveInteger(query, 'pageSize', 50, 100)!,
  };
}

export function parseAuditTimelineExportQuery(query: Record<string, unknown>): AuditTimelineExportQuery {
  return {
    ...parseAuditTimelineFilters(query),
    limit: positiveInteger(query, 'limit', undefined, 50_000),
  };
}
