/**
 * A random version-4 UUID for idempotency keys (clientRequestId,
 * clientUploadId, clientMessageId). The server only needs it to be unique
 * per sender, not secret. Uses the platform's crypto when it has one (web),
 * otherwise Math.random (Hermes has no crypto.randomUUID).
 */
export function uuidV4(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (bytes: Uint8Array) => Uint8Array } }).crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    try { return cryptoApi.randomUUID(); } catch { /* fall through */ }
  }
  const bytes = new Uint8Array(16);
  let filled = false;
  if (typeof cryptoApi?.getRandomValues === 'function') {
    try { cryptoApi.getRandomValues(bytes); filled = true; } catch { /* fall through */ }
  }
  if (!filled) {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
