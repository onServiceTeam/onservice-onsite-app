import express from 'express';
import cors from 'cors';
import request from 'supertest';

function buildApp(allowed: string[]): express.Express {
  const app = express();
  app.use(cors({
    origin: (origin, callback): void => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowed.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  }));
  app.get('/test', (_req, res) => {
    res.json({ ok: true });
  });
  // Translate CORS errors into 500 so we can assert on status without
  // crashing the test runner.
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction): void => {
    res.status(500).json({ error: err.message });
  });
  return app;
}

describe('CORS allowlist', () => {
  const allowed = ['http://localhost:7382', 'https://admin.onservice.ph'];

  it('allows origin in allowlist', async () => {
    const app = buildApp(allowed);
    const res = await request(app).get('/test').set('Origin', 'http://localhost:7382');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:7382');
  });

  it('rejects origin not in allowlist', async () => {
    const app = buildApp(allowed);
    const res = await request(app).get('/test').set('Origin', 'https://evil.example.com');
    // cors library calls next(err); our error handler returns 500.
    expect(res.status).toBe(500);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows requests with no Origin header (server-to-server)', async () => {
    const app = buildApp(allowed);
    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
  });

  it('parses comma-separated env var into multiple origins', () => {
    const raw = 'http://a.test, http://b.test ,http://c.test';
    const parsed = raw.split(',').map((o) => o.trim()).filter(Boolean);
    expect(parsed).toEqual(['http://a.test', 'http://b.test', 'http://c.test']);
  });
});
