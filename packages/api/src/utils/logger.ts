import winston from 'winston';

// PII redaction patterns. Order matters: phone/TIN/SSS/PhilHealth and PayMongo
// IDs must run before email so they don't accidentally consume parts of an
// email's local-part. Bcrypt hash is intentionally narrow ($2a/b/y$NN$...);
// scrypt hashes (our format `salt:hash` or `scrypt:N:r:p:salt:hash`) are NOT
// regex-redacted because the pattern would over-match general hex strings;
// callers must avoid logging password_hash columns explicitly.
const PII_PATTERNS: ReadonlyArray<{ regex: RegExp; replacement: string }> = [
  { regex: /(\+63\s?9\d{2}[\s-]?\d{3}[\s-]?\d{4})|(\b09\d{2}[\s-]?\d{3}[\s-]?\d{4})/g, replacement: '[REDACTED:phone]' },
  { regex: /\b\d{3}-\d{3}-\d{3}-\d{3}\b/g, replacement: '[REDACTED:tin]' },
  { regex: /\b\d{2}-\d{9}-\d\b/g, replacement: '[REDACTED:philhealth]' },
  { regex: /\b\d{2}-\d{7}-\d\b/g, replacement: '[REDACTED:sss]' },
  { regex: /\b(cus|src|pay|link)_[A-Za-z0-9]{6,}/g, replacement: '[REDACTED:paymongo]' },
  { regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, replacement: '[REDACTED:jwt]' },
  { regex: /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, replacement: '[REDACTED:hash]' },
  { regex: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, replacement: '[REDACTED:email]' },
];

function redactString(value: string): string {
  if (value.includes('[REDACTED:')) return value;
  let out = value;
  for (const { regex, replacement } of PII_PATTERNS) {
    out = out.replace(regex, replacement);
  }
  return out;
}

// MED-M11 fix — key-based redaction. The PII regex passes only catch
// values whose shape matches a known PII pattern (phone, email, JWT).
// Values that DON'T match the regex (scrypt hashes, random secrets,
// tokens, refresh tokens, API keys, encryption keys) would slip
// through if a caller logs them under a sensitive key. Defense in
// depth: any object key matching this regex has its value replaced
// with [REDACTED:key] regardless of value content.
const SENSITIVE_KEY_PATTERN = /(password|hash|secret|token|api[_-]?key|encryption[_-]?key|totp[_-]?secret|refresh|access)/i;

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      value[i] = redactValue(value[i], seen);
    }
    return value;
  }
  const obj = value as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    // MED-M11 — sensitive key gets value-blind redaction.
    if (SENSITIVE_KEY_PATTERN.test(k)) {
      obj[k] = '[REDACTED:key]';
      continue;
    }
    obj[k] = redactValue(obj[k], seen);
  }
  return obj;
}

export const piiMaskFormat = winston.format((info) => {
  const seen = new WeakSet<object>();
  if (typeof info.message === 'string') {
    info.message = redactString(info.message);
  } else if (info.message !== undefined) {
    info.message = redactValue(info.message, seen);
  }
  if (typeof info.stack === 'string') {
    info.stack = redactString(info.stack);
  }
  for (const k of Object.keys(info)) {
    if (k === 'level' || k === 'message' || k === 'stack' || k === 'timestamp') continue;
    info[k] = redactValue(info[k], seen);
  }
  return info;
});

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  piiMaskFormat(),
  winston.format.json(),
);

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: logFormat,
  defaultMeta: { service: 'onservice-api' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        piiMaskFormat(),
        winston.format.colorize(),
        winston.format.simple(),
      ),
    }),
  ],
});
