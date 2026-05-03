/**
 * TOTP (Time-based One-Time Password) implementation using Node.js crypto.
 * Follows RFC 6238 (TOTP) and RFC 4226 (HOTP).
 * Compatible with Google Authenticator, Authy, and other standard TOTP apps.
 */
import crypto from 'node:crypto';

const TOTP_PERIOD = 30; // seconds
const TOTP_DIGITS = 6;
const TOTP_ALGORITHM = 'sha1';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer: Buffer): string {
  let bits = '';
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, '0');
  }
  let result = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    result += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return result;
}

function base32Decode(encoded: string): Buffer {
  let bits = '';
  for (const char of encoded.toUpperCase().replace(/=+$/, '')) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  const buffer = crypto.randomBytes(20);
  return base32Encode(buffer);
}

function hotp(secret: Buffer, counter: bigint): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);

  const hmac = crypto.createHmac(TOTP_ALGORITHM, secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  const otp = binary % Math.pow(10, TOTP_DIGITS);
  return otp.toString().padStart(TOTP_DIGITS, '0');
}

export function generateTotp(base32Secret: string, timeOffset: number = 0): string {
  const secret = base32Decode(base32Secret);
  const counter = BigInt(Math.floor((Date.now() / 1000 + timeOffset) / TOTP_PERIOD));
  return hotp(secret, counter);
}

export function verifyTotp(base32Secret: string, token: string, window: number = 1): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  for (let i = -window; i <= window; i++) {
    const expected = generateTotp(base32Secret, i * TOTP_PERIOD);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token))) {
      return true;
    }
  }
  return false;
}

export function generateTotpUri(secret: string, email: string, issuer: string = 'onService'): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer | null {
  const keyHex = process.env.TOTP_ENCRYPTION_KEY;
  if (!keyHex) return null;
  // BUG-PHASE23-01 fix: pre-fix this silently returned a wrong-length
  // Buffer if the env var was not 64-char hex (the .env had a plain
  // ASCII placeholder by mistake). AES-256-GCM cipher creation then
  // crashed with "Invalid key length" → 2FA enrollment 500'd silently
  // → admin tier completely locked out of the platform's mandatory-2FA
  // path. Validate strictly: exactly 64 hex chars (AES-256 = 32 bytes).
  // Throw with a clear message instead of a cryptic crash later.
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error(
      `TOTP_ENCRYPTION_KEY must be exactly 64 hex chars (32 bytes for AES-256). ` +
      `Got ${keyHex.length} chars; first chars: "${keyHex.slice(0, 8)}". ` +
      `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    );
  }
  return Buffer.from(keyHex, 'hex');
}

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) return plaintext; // Fallback: store unencrypted if key not configured
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `enc:${Buffer.concat([iv, authTag, encrypted]).toString('base64')}`;
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith('enc:')) return stored; // Not encrypted, return as-is
  const key = getEncryptionKey();
  if (!key) throw new Error('TOTP_ENCRYPTION_KEY required to decrypt TOTP secrets');
  const data = Buffer.from(stored.slice(4), 'base64');
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}
