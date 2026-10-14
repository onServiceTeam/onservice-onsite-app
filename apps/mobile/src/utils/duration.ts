/** "m:ss" for a length in milliseconds (voice notes, videos). */
export function formatClock(ms: number | null | undefined): string {
  const totalSeconds = Math.max(0, Math.round(Number(ms ?? 0) / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

/** "12 seconds" / "1 minute 5 seconds" for screen readers. */
export function spokenDuration(ms: number | null | undefined): string {
  const totalSeconds = Math.max(0, Math.round(Number(ms ?? 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const secondsPart = totalSeconds % 60;
  const parts: string[] = [];
  if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  if (secondsPart > 0 || minutes === 0) parts.push(`${secondsPart} second${secondsPart === 1 ? '' : 's'}`);
  return parts.join(' ');
}
