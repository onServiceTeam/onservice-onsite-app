#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function parseEnv(file) {
  const values = new Map();
  const duplicates = [];
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equals = line.indexOf('=');
    if (equals < 1) continue;
    const key = line.slice(0, equals).trim();
    const value = line.slice(equals + 1).trim();
    if (values.has(key)) duplicates.push(key);
    values.set(key, value);
  }
  return { values, duplicates };
}

const root = path.resolve(import.meta.dirname, '..');
const productionFile = path.resolve(argument('--production', path.join(root, '.env.production.example')));
const mobileFile = path.resolve(argument('--mobile', path.join(root, 'apps/mobile/.env.example')));
const production = parseEnv(productionFile);
const mobile = parseEnv(mobileFile);
const problems = [];

const requiredServerKeys = [
  'NODE_ENV', 'PORT', 'APP_VERSION', 'APP_URL', 'ADMIN_URL', 'API_URL', 'TRUST_PROXY_HOPS',
  'ADMIN_DISABLE_2FA', 'ALLOW_DEV_OTP', 'DEV_OTP_CODE', 'ENABLE_TEST_FIXTURES',
  'BIR_DOCUMENT_ISSUANCE_ENABLED', 'EXTERNAL_PAYMENT_AUTHORIZATION_ENABLED',
  'DISPUTE_PARTY_SETTLEMENT_ENABLED',
  'RATE_LIMITS_RELAXED', 'DATABASE_URL', 'DATABASE_DIRECT_URL', 'DB_NAME', 'DB_USER',
  'DB_PASSWORD', 'DB_POOL_MIN', 'DB_POOL_MAX', 'DB_SSL_MODE', 'REDIS_HOST', 'REDIS_PORT',
  'REDIS_PASSWORD', 'JWT_SECRET', 'DATA_EXPORT_DOWNLOAD_SECRET', 'JWT_ACCESS_EXPIRES_IN',
  'JWT_REFRESH_EXPIRES_IN', 'JWT_ADMIN_REFRESH_EXPIRES_IN', 'TOTP_ENCRYPTION_KEY',
  'PAYMONGO_PUBLIC_KEY', 'PAYMONGO_SECRET_KEY', 'PAYMONGO_WEBHOOK_SECRET',
  'PAYMONGO_CHECKOUT_BASE', 'SEMAPHORE_API_KEY', 'SEMAPHORE_SENDER_NAME',
  'TURNSTILE_SECRET_KEY', 'FCM_PROJECT_ID', 'GOOGLE_APPLICATION_CREDENTIALS',
  'EXPO_ACCESS_TOKEN', 'RESEND_API_KEY', 'EMAIL_FROM', 'OTP_MAX_REQUESTS_PER_HOUR',
  'RATE_LIMIT_AUTH_MAX_REQUESTS', 'ALLOWED_ORIGINS', 'S3_ENDPOINT', 'S3_BUCKET',
  'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_REGION', 'S3_CDN_URL', 'S3_KMS_KEY_ID',
  'KYC_S3_BUCKET', 'UPLOAD_DIR', 'UPLOAD_BASE_URL', 'AWS_S3_BUCKET', 'AWS_REGION',
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'FEEDBACK_EXPORT_KEY',
  'SLACK_ALERT_WEBHOOK_URL', 'SENTRY_API_DSN', 'SENTRY_ENVIRONMENT', 'SENTRY_RELEASE',
  'GRAFANA_ADMIN_USER', 'GRAFANA_ADMIN_PASSWORD', 'DOMAIN', 'CERTBOT_EMAIL',
];

const requiredMobileKeys = [
  'EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_TURNSTILE_SITE_KEY', 'EXPO_PUBLIC_DEMO_MODE',
  'EXPO_PUBLIC_DEMO_CUSTOMER_PHONE', 'EXPO_PUBLIC_DEMO_PROVIDER_PHONE',
  'EXPO_PUBLIC_DEMO_OTP', 'EAS_PROJECT_ID', 'GOOGLE_MAPS_IOS_API_KEY',
  'GOOGLE_MAPS_ANDROID_API_KEY', 'SENTRY_DSN_MOBILE',
];

for (const key of requiredServerKeys) {
  if (!production.values.has(key)) problems.push(`production template is missing ${key}`);
}
for (const key of requiredMobileKeys) {
  if (!mobile.values.has(key)) problems.push(`mobile template is missing ${key}`);
}
for (const key of production.duplicates) problems.push(`production template duplicates ${key}`);
for (const key of mobile.duplicates) problems.push(`mobile template duplicates ${key}`);

if (production.values.get('NODE_ENV') !== 'production') {
  problems.push('production template must set NODE_ENV=production');
}
for (const key of [
  'ADMIN_DISABLE_2FA', 'ALLOW_DEV_OTP', 'ENABLE_TEST_FIXTURES',
  'RATE_LIMITS_RELAXED', 'BIR_DOCUMENT_ISSUANCE_ENABLED',
  'EXTERNAL_PAYMENT_AUTHORIZATION_ENABLED',
  'DISPUTE_PARTY_SETTLEMENT_ENABLED',
]) {
  if (production.values.get(key) !== '0') problems.push(`production template must set ${key}=0`);
}
if (production.values.get('DEV_OTP_CODE') !== '') {
  problems.push('production template must leave DEV_OTP_CODE empty');
}
if (production.values.get('DB_SSL_MODE') !== 'disable') {
  problems.push('current self-hosted production template must set DB_SSL_MODE=disable');
}
if (mobile.values.get('EXPO_PUBLIC_DEMO_MODE') !== '0') {
  problems.push('mobile template must set EXPO_PUBLIC_DEMO_MODE=0');
}
for (const key of [
  'EXPO_PUBLIC_DEMO_CUSTOMER_PHONE', 'EXPO_PUBLIC_DEMO_PROVIDER_PHONE', 'EXPO_PUBLIC_DEMO_OTP',
]) {
  if (mobile.values.get(key) !== '') problems.push(`mobile template must leave ${key} empty`);
}

for (const legacy of ['CAPTCHA_SECRET_KEY', 'CAPTCHA_SITE_KEY', 'HCAPTCHA_SECRET', 'SENTRY_DSN']) {
  if (production.values.has(legacy)) problems.push(`production template uses legacy ${legacy}`);
}

for (const key of [
  'TURNSTILE_SECRET_KEY', 'SENTRY_API_DSN', 'SLACK_ALERT_WEBHOOK_URL', 'AWS_S3_BUCKET',
  'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'S3_BUCKET', 'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY', 'KYC_S3_BUCKET',
]) {
  if (production.values.get(key) !== '') {
    problems.push(`tracked production template must leave ${key} empty`);
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`FAIL: ${problem}`);
  process.exit(1);
}

console.log(`OK: server/mobile environment templates satisfy ${requiredServerKeys.length + requiredMobileKeys.length} contract keys and safe defaults`);
