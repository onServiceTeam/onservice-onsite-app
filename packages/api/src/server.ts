import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

import * as Sentry from '@sentry/node';

// Initialize Sentry before any other imports
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    release: `onservice-api@${process.env.npm_package_version || '0.1.0'}`,
  });
}

import express from 'express';
import { createServer } from 'node:http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { errorMiddleware } from './middleware/error.middleware';
import { rateLimitMiddleware, initRateLimit } from './middleware/rate-limit.middleware';
import { requireAdminCsrf } from './middleware/admin-csrf.middleware';
import { logger } from './utils/logger';
import { platformConfig } from './config/platform.config';
import { initSocketServer } from './services/socket.service';
import { initScheduledJobs } from './jobs/workers';
import { collectMetrics, toPrometheusFormat } from './services/metrics.service';

import authRoutes from './routes/auth.routes';
import bookingRoutes from './routes/booking.routes';
import catalogRoutes from './routes/catalog.routes';
import providerRoutes from './routes/provider.routes';
import reviewRoutes from './routes/review.routes';
import disputeRoutes from './routes/dispute.routes';
import walletRoutes from './routes/wallet.routes';
import paymentRoutes from './routes/payment.routes';
import adminRoutes from './routes/admin.routes';
import providerAdminRoutes from './routes/provider-admin.routes';
import customerAdminRoutes from './routes/customer-admin.routes';
import bookingAdminRoutes from './routes/booking-admin.routes';
import disputeAdminRoutes from './routes/dispute-admin.routes';
import financialAdminRoutes from './routes/financial-admin.routes';
import birAdminRoutes from './routes/bir-admin.routes';
import marketingAdminRoutes from './routes/marketing-admin.routes';
import complianceAdminRoutes from './routes/compliance-admin.routes';
import complianceRoutes from './routes/compliance.routes';
import webhookRoutes from './routes/webhook.routes';
import notificationRoutes from './routes/notification.routes';
import notificationTemplateRoutes from './routes/notification-template.routes';
import messagingRoutes from './routes/messaging.routes';
import addressRoutes from './routes/address.routes';
import referralRoutes from './routes/referral.routes';
import recurringRoutes from './routes/recurring.routes';
import sukiRoutes from './routes/suki.routes';
import uploadRoutes from './routes/upload.routes';
import checklistRoutes from './routes/checklist.routes';
import breachLogRoutes from './routes/breach-log.routes';
import serviceAreaRoutes from './routes/service-area.routes';
import businessRoutes from './routes/business.routes';
import payoutRoutes from './routes/payout.routes';
import tipRoutes from './routes/tip.routes';
import securityRoutes from './routes/security.routes';
import accountRoutes from './routes/account.routes';
import promotionRoutes from './routes/promotion.routes';
import supportTicketRoutes from './routes/support-ticket.routes';
import staffRoutes from './routes/staff.routes';
import settingsRoutes from './routes/settings.routes';
import cancellationPolicyPublicRoutes from './routes/cancellation-policy-public.routes';
import cancellationPolicyAdminRoutes from './routes/cancellation-policy-admin.routes';
import * as settingsService from './services/settings.service';
import { db } from './models/db';
import { redis } from './config/redis.config';

// CRIT-M04, M05, MED-N66, N95, N169 fix — startup-time validation of
// production-required secrets. Pre-fix: each env var was checked at
// first-request time (TOTP encryption fell back to plaintext, JWT
// signing threw at sign time, CAPTCHA failed open, PayMongo webhook
// rejected silently, all without admins noticing). Post-fix: refuse
// to boot in production with any of these unset so misconfiguration
// is impossible to ship.
function validateProductionSecrets(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const required: Record<string, string | undefined> = {
    JWT_SECRET: process.env.JWT_SECRET,
    TOTP_ENCRYPTION_KEY: process.env.TOTP_ENCRYPTION_KEY,
    CAPTCHA_SECRET_KEY: process.env.CAPTCHA_SECRET_KEY,
    PAYMONGO_WEBHOOK_SECRET: process.env.PAYMONGO_WEBHOOK_SECRET,
  };
  const missing = Object.entries(required)
    .filter(([, v]) => !v || v.length === 0)
    .map(([k]) => k);
  if (missing.length > 0) {
    // Synchronous throw to prevent the server from binding the port.
    throw new Error(
      `FATAL: production startup blocked — required env vars unset: ${missing.join(', ')}. ` +
        'Each value must be configured before the API will boot in production. ' +
        'See packages/api/src/server.ts validateProductionSecrets for the full list.',
    );
  }
}
validateProductionSecrets();

const app = express();
const PORT = process.env.PORT || 3001;

// CRIT-M05 fix — trust the load balancer / reverse proxy headers so
// req.ip returns the real client IP. Pre-fix: req.ip returned the LB's
// IP. That broke OTP lockout (one LB IP locked out all users), audit
// logs (every audit row showed the same handful of IPs), and rate
// limiting (per-IP limits were per-LB limits). The hop count is
// configurable via TRUST_PROXY_HOPS env var so different deployments
// (single LB vs LB-in-front-of-CDN) can tune appropriately.
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 1);
if (Number.isFinite(trustProxyHops) && trustProxyHops > 0) {
  app.set('trust proxy', trustProxyHops);
}

// --- Security Middleware ---
app.use(helmet());
const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.APP_URL || 'http://localhost:3000,http://localhost:7382')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors({
  origin: (origin, callback): void => {
    // Allow no-origin requests (server-to-server, mobile apps, curl, same-origin).
    if (!origin) {
      callback(null, true);
      return;
    }
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// --- Body Parsing (capture raw body for webhook signature verification) ---
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    (req as express.Request & { rawBody?: string }).rawBody = buf.toString();
  },
}));
app.use(express.urlencoded({ extended: true }));

// --- Cookie parsing (Bug 1251 fix — admin auth uses HttpOnly cookies) ---
app.use(cookieParser());

// --- Compression ---
app.use(compression());

// --- Request Logging ---
app.use(morgan('combined', {
  stream: { write: (message: string): void => { logger.info(message.trim()); } },
}));

// --- Rate Limiting ---
app.use(rateLimitMiddleware);

// --- Health Check ---
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: platformConfig.appVersion,
  });
});

// --- Deep Health Check (checks DB + Redis) ---
app.get('/health/ready', async (_req, res) => {
  const checks: Record<string, 'ok' | 'error'> = {};
  let allOk = true;

  try {
    await db.query('SELECT 1');
    checks.postgres = 'ok';
  } catch {
    checks.postgres = 'error';
    allOk = false;
  }

  try {
    await redis.ping();
    checks.redis = 'ok';
  } catch {
    checks.redis = 'error';
    allOk = false;
  }

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ready' : 'degraded',
    timestamp: new Date().toISOString(),
    version: platformConfig.appVersion,
    checks,
  });
});

// --- Webhooks (must be before JSON parsing but we need raw body) ---
app.use('/api/v1/webhooks', webhookRoutes);

// --- API Routes ---
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/bookings', bookingRoutes);
app.use('/api/v1/catalog', catalogRoutes);
app.use('/api/v1/providers', providerRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/disputes', disputeRoutes);
app.use('/api/v1/wallet', walletRoutes);
app.use('/api/v1/payments', paymentRoutes);
// Bug 1251 fix: every admin write request must carry an X-CSRF-Token header
// matching the admin_csrf cookie. The middleware exempts GET/HEAD/OPTIONS so
// reads are unaffected. The admin login endpoint sits under /api/v1/auth/admin
// (not /api/v1/admin), so it is not blocked by this guard.
app.use('/api/v1/admin', requireAdminCsrf);
// Phase 03: settings routes are mounted BEFORE generic admin routes so the
// more specific /admin/settings path wins over /admin/* fallthrough.
app.use('/api/v1/admin/settings', settingsRoutes);
// Bug 1170 / 1198 (Phase 14 Dispatch 02) — admin cancellation-policy editor.
app.use('/api/v1/admin/cancellation-policies', cancellationPolicyAdminRoutes);
// Phase 05: provider 360 sub-routes mounted BEFORE generic admin routes so
// `/admin/providers/:id/profile` etc. match before any `/admin/*` fallthrough.
app.use('/api/v1/admin/providers', providerAdminRoutes);
// Phase 06: customer 360 sub-routes mounted BEFORE generic admin routes so
// `/admin/customers/:id/...` match before any `/admin/customers` (list) fallthrough.
app.use('/api/v1/admin/customers', customerAdminRoutes);
// Phase 07: booking 360 + dispute detail sub-routes mounted BEFORE generic
// admin routes so `/admin/bookings/:id/...` and `/admin/disputes/:id/...` match
// before any `/admin/bookings` or `/admin/disputes` (list) fallthrough.
app.use('/api/v1/admin/bookings', bookingAdminRoutes);
app.use('/api/v1/admin/disputes', disputeAdminRoutes);
// Phase 08: financial + BIR admin sub-routes mounted BEFORE generic admin
// routes so `/admin/financials/...` and `/admin/bir/...` match before any
// `/admin/*` fallthrough.
app.use('/api/v1/admin/financials', financialAdminRoutes);
app.use('/api/v1/admin/bir', birAdminRoutes);
// Phase 09: marketing admin sub-routes mounted BEFORE generic admin routes
// so `/admin/marketing/...` matches before any `/admin/*` fallthrough.
app.use('/api/v1/admin/marketing', marketingAdminRoutes);
// Phase 11: compliance admin sub-routes mounted BEFORE generic admin routes
// so `/admin/compliance/...` matches before any `/admin/*` fallthrough.
app.use('/api/v1/admin/compliance', complianceAdminRoutes);
// Phase 14 Dispatch 08 — Bug 1366 breach log (DPO-only).
app.use('/api/v1/admin/breach-log', breachLogRoutes);
app.use('/api/v1/admin', adminRoutes);
// Phase 11: end-user compliance endpoints (DSR + consent recording).
app.use('/api/v1/compliance', complianceRoutes);

// Bug 1170 / 1198 (Phase 14 Dispatch 02) — public cancellation-policy read.
app.use('/api/v1/settings', cancellationPolicyPublicRoutes);

// Phase 03: public client config endpoint (no auth required).
app.get('/api/v1/config', async (_req, res) => {
  try {
    const config = await settingsService.getClientConfig();
    res.json({ success: true, data: config });
  } catch {
    res.json({
      success: true,
      data: {
        appVersion: '0.1.0',
        currency: 'PHP',
        currencySymbol: '\u20B1',
        timezone: 'Asia/Manila',
      },
    });
  }
});
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/notification-templates', notificationTemplateRoutes);
app.use('/api/v1/messaging', messagingRoutes);
app.use('/api/v1/addresses', addressRoutes);
app.use('/api/v1/referrals', referralRoutes);
app.use('/api/v1/recurring', recurringRoutes);
app.use('/api/v1/suki', sukiRoutes);
app.use('/api/v1/uploads', uploadRoutes);
// Phase 14 Dispatch 07 — Bug 460 + 463 server-driven checklists.
app.use('/api/v1', checklistRoutes);
app.use('/api/v1/service-areas', serviceAreaRoutes);
app.use('/api/v1/business', businessRoutes);
app.use('/api/v1/payouts', payoutRoutes);
app.use('/api/v1/tips', tipRoutes);
app.use('/api/v1/security', securityRoutes);
app.use('/api/v1/account', accountRoutes);
app.use('/api/v1/promotions', promotionRoutes);
app.use('/api/v1/support-tickets', supportTicketRoutes);
app.use('/api/v1/staff', staffRoutes);

// --- Prometheus Metrics Endpoint (before error handlers so it always responds) ---
app.get('/metrics', async (_req, res) => {
  try {
    const metrics = await collectMetrics();
    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(toPrometheusFormat(metrics));
  } catch {
    res.status(500).send('# Error collecting metrics\n');
  }
});

// --- Sentry Error Handler (must be before custom error handler) ---
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

// --- Global Error Handler (must be last) ---
app.use(errorMiddleware);

// --- Create HTTP Server (required for Socket.io) ---
const httpServer = createServer(app);

// --- Initialize Socket.io ---
initSocketServer(httpServer);
logger.info('Socket.io server initialized');

// --- Start Server ---
httpServer.listen(PORT, () => {
  logger.info(`onService API server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);

  // CRIT-M01 fix — pull live rate-limit settings from DB before
  // accepting traffic (best-effort: limiter falls back to platformConfig
  // defaults if DB read fails) and start the periodic refresh loop.
  initRateLimit()
    .then(() => logger.info('Rate-limit live config loaded'))
    .catch((err: unknown) => logger.error('Rate-limit init failed; using platformConfig defaults', { error: err }));

  // Initialize background jobs after server is listening
  initScheduledJobs()
    .then(() => logger.info('Scheduled jobs initialized'))
    .catch((err: unknown) => logger.error('Failed to initialize scheduled jobs', { error: err }));
});

export { httpServer };
export default app;
