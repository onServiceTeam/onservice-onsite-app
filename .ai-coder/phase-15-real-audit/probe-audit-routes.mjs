// Quick probe: hit consent + audit-log routes and capture status + raw text
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const t = jwt.sign(
  { userId: '567c0f38-31d9-45f9-88bf-7d0485f49393', role: 'super_admin', type: 'access' },
  process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' }
);
async function hit(url) {
  const r = await fetch('http://localhost:7381' + url, {
    headers: { Authorization: 'Bearer ' + t, 'X-Forwarded-For': '10.99.7.7' },
  });
  console.log('GET', url, '→', r.status);
  const txt = await r.text();
  console.log('  body:', txt.slice(0, 400));
  console.log('  hdrs:', [...r.headers.entries()].slice(0,5));
  console.log('');
}
await hit('/api/v1/admin/compliance/consent');
await hit('/api/v1/admin/compliance/consent?limit=1');
await hit('/api/v1/admin/compliance/consent?userId=00000000-0000-0000-0000-000000000001&limit=1');
await hit('/api/v1/admin/compliance/audit-log/export.csv?limit=1');
