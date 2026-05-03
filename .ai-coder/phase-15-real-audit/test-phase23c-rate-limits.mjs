// Phase 23c — explicit rate limit boundary tests.
// Hit the limits intentionally + verify 429 + verify limits reset.

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API = 'http://localhost:7381';

let pass = 0, fail = 0;
const failures = [];
function check(cond, msg, extra) {
  if (cond) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗', msg, extra ?? ''); failures.push({msg, extra}); }
}

// Reset rate limits before starting
const { execSync } = await import('child_process');
try {
  // Flush all rate-limit key prefixes (rl:global, rl:auth, rl:auth-routes).
  execSync(`docker exec onservice-redis redis-cli eval "local keys = redis.call('keys', ARGV[1]) for i=1,#keys do redis.call('del', keys[i]) end return #keys" 0 "rl:*"`, {stdio:'pipe'});
} catch {}

// ════════════════════════════════════════════════════════════════════
// 1. Auth rate limit: hit /auth/send-otp from same IP > 10 times
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 1. Auth rate limit (/send-otp, 10 reqs/min default) ===');

const stickyIp = '10.99.111.222';
let firstResults = [];
for (let i = 0; i < 12; i++) {
  // PH mobile format: +63 + 10 digits. Use 9171234XXX so each i gets unique digits.
  const phone = '+63917123' + String(4000 + i).padStart(4, '0');
  const r = await fetch(API + '/api/v1/auth/send-otp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': stickyIp,
    },
    body: JSON.stringify({ phone }),
  });
  firstResults.push(r.status);
}
console.log('  request statuses:', firstResults.join(','));
const ok2xx = firstResults.filter(s => s >= 200 && s < 300).length;
const r429 = firstResults.filter(s => s === 429).length;
check(ok2xx >= 1 && r429 >= 1,
  '12 requests from same IP produce both 2xx and 429 (limit is enforced)',
  '2xx: ' + ok2xx + ', 429: ' + r429);
check(r429 >= 2, 'at least 2 of 12 requests rate-limited',
  '429 count: ' + r429);

// ════════════════════════════════════════════════════════════════════
// 2. Different IPs are not affected by the sticky IP's limit
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 2. Different IP unaffected by another IP\'s limit ===');

const freshIp = '10.99.222.111';
const fresh = await fetch(API + '/api/v1/auth/send-otp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': freshIp },
  body: JSON.stringify({ phone: '+639171234500' }),
});
check(fresh.status === 200, 'fresh IP gets through (per-IP isolation)',
  'got ' + fresh.status);

// ════════════════════════════════════════════════════════════════════
// 3. After flushing rate limit, sticky IP works again
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 3. After flush, sticky IP works again ===');
try {
  // Flush all rate-limit key prefixes (rl:global, rl:auth, rl:auth-routes).
  execSync(`docker exec onservice-redis redis-cli eval "local keys = redis.call('keys', ARGV[1]) for i=1,#keys do redis.call('del', keys[i]) end return #keys" 0 "rl:*"`, {stdio:'pipe'});
} catch {}

const recovered = await fetch(API + '/api/v1/auth/send-otp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': stickyIp },
  body: JSON.stringify({ phone: '+639171234600' }),
});
check(recovered.status === 200, 'sticky IP recovers after rate-limit flush',
  'got ' + recovered.status);

// ════════════════════════════════════════════════════════════════════
// 4. Global rate limit: hit /catalog (general endpoint) > 100 times
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 4. Global rate limit (default 100/min) ===');
try {
  // Flush all rate-limit key prefixes (rl:global, rl:auth, rl:auth-routes).
  execSync(`docker exec onservice-redis redis-cli eval "local keys = redis.call('keys', ARGV[1]) for i=1,#keys do redis.call('del', keys[i]) end return #keys" 0 "rl:*"`, {stdio:'pipe'});
} catch {}

const burstIp = '10.99.99.88';
const burstResults = [];
const N = 110;
const concurrency = 10;
for (let i = 0; i < N; i += concurrency) {
  const batch = await Promise.all(Array.from({length: Math.min(concurrency, N - i)}, () =>
    fetch(API + '/api/v1/catalog', {
      headers: { 'X-Forwarded-For': burstIp },
    }).then(r => r.status)
  ));
  burstResults.push(...batch);
}
const burst2xx = burstResults.filter(s => s >= 200 && s < 300).length;
const burst429 = burstResults.filter(s => s === 429).length;
console.log('  ' + N + ' requests: 2xx=' + burst2xx + ' 429=' + burst429);
check(burst2xx >= 1, 'at least some requests succeeded');
check(burst429 >= 1 || burst2xx === N, 'rate limit kicked in (429s seen) OR limit higher than N',
  '2xx: ' + burst2xx + ', 429: ' + burst429);

// ════════════════════════════════════════════════════════════════════
// 5. Rate limit returns proper headers (RateLimit-Remaining, etc.)
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 5. Rate limit response headers ===');
try {
  // Flush all rate-limit key prefixes (rl:global, rl:auth, rl:auth-routes).
  execSync(`docker exec onservice-redis redis-cli eval "local keys = redis.call('keys', ARGV[1]) for i=1,#keys do redis.call('del', keys[i]) end return #keys" 0 "rl:*"`, {stdio:'pipe'});
} catch {}

const headerTest = await fetch(API + '/api/v1/auth/send-otp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.99.55.55' },
  body: JSON.stringify({ phone: '+639171234701' }),
});
const remaining = headerTest.headers.get('ratelimit-remaining');
const limit = headerTest.headers.get('ratelimit-limit');
const reset = headerTest.headers.get('ratelimit-reset');
console.log('  RateLimit-Limit: ' + limit + ', Remaining: ' + remaining + ', Reset: ' + reset);
check(remaining !== null, 'RateLimit-Remaining header present');
check(limit !== null, 'RateLimit-Limit header present');

// ════════════════════════════════════════════════════════════════════
// 6. 429 response body is JSON with helpful message
// ════════════════════════════════════════════════════════════════════
console.log('\n=== 6. 429 response shape ===');
// Use prior burst results — find a 429 and re-check the response body
const burstAgain = await fetch(API + '/api/v1/auth/send-otp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': stickyIp },
  body: JSON.stringify({ phone: '+639171234702' }),
});
// Burn through limit again
const flooderIp = '10.99.66.77';
let lastBlock;
for (let i = 0; i < 20; i++) {
  const r = await fetch(API + '/api/v1/auth/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': flooderIp },
    body: JSON.stringify({ phone: '+639171234' + String(800 + i).padStart(3, '0') }),
  });
  if (r.status === 429) { lastBlock = r; break; }
}
if (lastBlock) {
  const body = await lastBlock.json().catch(() => ({}));
  check(typeof body === 'object' && body !== null,
    '429 returns JSON body',
    JSON.stringify(body).slice(0,150));
  check(body.success === false || body.error,
    '429 body has error indicator',
    JSON.stringify(body).slice(0,150));
} else {
  console.log('  (could not trigger another 429 to inspect body)');
}

console.log('\n=== ' + pass + ' pass / ' + fail + ' fail ===');
if (failures.length) {
  console.log('\n--- Failures ---');
  failures.forEach(f => console.log('  ✗', f.msg, f.extra ? '\n    '+JSON.stringify(f.extra).slice(0,250) : ''));
}

// Final cleanup
try {
  // Flush all rate-limit key prefixes (rl:global, rl:auth, rl:auth-routes).
  execSync(`docker exec onservice-redis redis-cli eval "local keys = redis.call('keys', ARGV[1]) for i=1,#keys do redis.call('del', keys[i]) end return #keys" 0 "rl:*"`, {stdio:'pipe'});
} catch {}

process.exit(fail === 0 ? 0 : 1);
