/**
 * Single-range HTTP Range parsing for streaming private job media (D38).
 *
 * Video and audio players ask for byte ranges ("bytes=0-", "bytes=100-199",
 * "bytes=-500"). Only one range is served. Per RFC 9110:
 *   - a header that is missing, not a bytes range, or not well formed is
 *     ignored, so the caller sends the whole file (200);
 *   - several ranges ("bytes=0-1,5-9") are also answered with the whole file;
 *   - a well-formed range that starts at or past the end of the file cannot be
 *     satisfied (416 with Content-Range: bytes * /size).
 */

export interface ByteRange {
  start: number;
  /** Inclusive. */
  end: number;
}

const DIGITS = /^\d{1,16}$/;

export function parseSingleRange(
  header: string | undefined,
  size: number,
): ByteRange | 'unsatisfiable' | null {
  if (typeof header !== 'string') return null;
  const trimmed = header.trim();
  const match = /^bytes\s*=\s*(.*)$/i.exec(trimmed);
  if (!match) return null;
  const spec = match[1]!.trim();
  if (!spec || spec.includes(',')) return null;

  const dash = spec.indexOf('-');
  if (dash < 0) return null;
  const first = spec.slice(0, dash).trim();
  const last = spec.slice(dash + 1).trim();

  if (first === '') {
    // Suffix range: the final N bytes.
    if (!DIGITS.test(last)) return null;
    const suffix = Number(last);
    if (suffix === 0 || size <= 0) return 'unsatisfiable';
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }

  if (!DIGITS.test(first)) return null;
  const start = Number(first);
  if (last !== '' && !DIGITS.test(last)) return null;
  const end = last === '' ? size - 1 : Number(last);
  if (last !== '' && end < start) return null;
  if (start >= size) return 'unsatisfiable';
  return { start, end: Math.min(end, size - 1) };
}
