/**
 * Date/time utilities for Asia/Manila (PHT, UTC+8).
 * Store in UTC, display in PHT. Never use MM/DD/YYYY format.
 */

const TIMEZONE = 'Asia/Manila';

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: TIMEZONE,
  });
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: TIMEZONE,
  });
}

export function formatDateTime(date: Date | string): string {
  return `${formatDate(date)}, ${formatTime(date)}`;
}

export function toLocalPHT(utcDate: Date | string): Date {
  const d = typeof utcDate === 'string' ? new Date(utcDate) : utcDate;
  return new Date(d.toLocaleString('en-US', { timeZone: TIMEZONE }));
}

export function formatBookingRef(id: string, createdAt?: Date | string | null): string {
  const year = createdAt ? new Date(createdAt).getFullYear() : new Date().getFullYear();
  const suffix = id.replace(/-/g, '').slice(-4).toUpperCase();
  return `OS-${year}-${suffix}`;
}

export function formatRelative(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();

  if (diffMs < 0) {
    const futureMins = Math.floor(-diffMs / 60000);
    const futureHours = Math.floor(-diffMs / 3600000);
    const futureDays = Math.floor(-diffMs / 86400000);

    if (futureMins < 60) return `In ${futureMins}m`;
    if (futureHours < 24) return `In ${futureHours}h`;
    if (futureDays < 7) return `In ${futureDays}d`;
    return formatDate(d);
  }

  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(d);
}
