import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

import * as Sentry from '@sentry/node';

// Initialize Sentry before any other imports.
// Accept SENTRY_DSN or SENTRY_API_DSN — the launch-cutover runbook (Item 6)
// names the latter, so honor both rather than silently leaving tracking off.
const SENTRY_DSN = process.env.SENTRY_DSN || process.env.SENTRY_API_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    release: process.env.SENTRY_RELEASE || `onservice-api@${process.env.npm_package_version || '0.1.0'}`,
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
import { rateLimitMiddleware, initRateLimit, initUploadRateLimit } from './middleware/rate-limit.middleware';
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
import providerStaffRoutes from './routes/provider-staff.routes';
import reviewRoutes from './routes/review.routes';
import disputeRoutes from './routes/dispute.routes';
import walletRoutes from './routes/wallet.routes';
import paymentRoutes from './routes/payment.routes';
import adminRoutes from './routes/admin.routes';
import adminSearchRoutes from './routes/admin-search.routes';
import providerAdminRoutes from './routes/provider-admin.routes';
import customerAdminRoutes from './routes/customer-admin.routes';
import messagingAdminRoutes from './routes/messaging-admin.routes';
import bookingAdminRoutes from './routes/booking-admin.routes';
import disputeAdminRoutes from './routes/dispute-admin.routes';
import financialAdminRoutes from './routes/financial-admin.routes';
import birAdminRoutes from './routes/bir-admin.routes';
import marketingAdminRoutes from './routes/marketing-admin.routes';
import complianceAdminRoutes from './routes/compliance-admin.routes';
import adminLatentRoutes from './routes/admin-latent.routes';
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
import feedbackRoutes from './routes/feedback.routes';
import feedbackAdminRoutes from './routes/feedback-admin.routes';
import projectRoutes from './routes/project.routes';
import cancellationPolicyAdminRoutes from './routes/cancellation-policy-admin.routes';
import * as settingsService from './services/settings.service';
import {
  assertAdmin2faNotDisabledInProduction,
  resolveTrustProxyHops,
  validateProductionSecrets,
} from './config/boot-guards';
import { assertDevOtpConfiguration } from './config/dev-otp';
import { db } from './models/db';
import { redis } from './config/redis.config';

// CRIT-M04, M05, MED-N66, N95, N169 — refuse production startup before
// binding a port when required secrets are absent or unsafe.
validateProductionSecrets();

// Test phone login is allowed only outside production and only for an
// explicit phone allowlist. Reject unsafe/malformed setup before binding.
assertDevOtpConfiguration();

// A1 / C1 — refuse to boot if admin 2FA is disabled in production. The flag
// is a staging/testing escape hatch (LAUNCH-LIMITATIONS.md #37); leaving it on
// in production would reduce the most privileged accounts to password-only.
// Throws synchronously, before the port is bound, so it can never ship silently.
assertAdmin2faNotDisabledInProduction();

const app = express();
const PORT = process.env.PORT || 3001;

// CRIT-M05 fix — trust the load balancer / reverse proxy headers so
// req.ip returns the real client IP. Pre-fix: req.ip returned the LB's
// IP. That broke OTP lockout (one LB IP locked out all users), audit
// logs (every audit row showed the same handful of IPs), and rate
// limiting (per-IP limits were per-LB limits). The hop count is
// configurable via TRUST_PROXY_HOPS env var so different deployments
// (single LB vs LB-in-front-of-CDN) can tune appropriately.
const trustProxyHops = resolveTrustProxyHops();
if (trustProxyHops !== null) {
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
app.use('/api/v1/staff', providerStaffRoutes);
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
// W10 — bounded cross-entity command search. Keep it separate from the
// generic admin router so its validation and E34 operations-role boundary are
// independently testable.
app.use('/api/v1/admin/search', adminSearchRoutes);
// Phase 05: provider 360 sub-routes mounted BEFORE generic admin routes so
// `/admin/providers/:id/profile` etc. match before any `/admin/*` fallthrough.
app.use('/api/v1/admin/providers', providerAdminRoutes);
// Phase 06: customer 360 sub-routes mounted BEFORE generic admin routes so
// `/admin/customers/:id/...` match before any `/admin/customers` (list) fallthrough.
app.use('/api/v1/admin/customers', customerAdminRoutes);
// D26 step 1: admin chat moderation (list/read conversations, flagged+reported
// review queue, redact, resolve flag) — mounted before generic /admin/* so the
// specific /admin/conversations/* paths win.
app.use('/api/v1/admin/conversations', messagingAdminRoutes);
// UX-037 — tester feedback is an owned Support & Trust queue. Mount the
// specific route before the generic /admin router so feedback IDs are never
// mistaken for generic admin resources.
app.use('/api/v1/admin/feedback', feedbackAdminRoutes);
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
// Phase 28a — wire previously-latent admin services (provider applications,
// service-area-changes, admin TOTP backup codes regen). Must mount BEFORE
// the generic adminRoutes catch-all so the more specific paths match first.
app.use('/api/v1/admin', adminLatentRoutes);
app.use('/api/v1/admin', adminRoutes);
// Phase 11: end-user compliance endpoints (DSR + consent recording).
app.use('/api/v1/compliance', complianceRoutes);

// Bug 1170 / 1198 (Phase 14 Dispatch 02) — public cancellation-policy read.
app.use('/api/v1/settings', cancellationPolicyPublicRoutes);

// UX tester feedback — public POST from the /feedback page; key-protected
// JSON/Markdown/CSV exports for the dev/design team and the AI coder.
app.use('/api/v1/feedback', feedbackRoutes);

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
// BUG-PHASE18-04 fix — admin web (NotificationTemplatesPage) calls
// /api/v1/admin/notification-templates following the codebase convention,
// but this resource was originally mounted at /api/v1/notification-templates
// without the /admin prefix. The page silently 404'd on every load and
// showed an empty table. Adding an alias mount preserves both URLs;
// requireAdmin() inside the route handler still gates access. Removing
// the original mount is risky (any external caller might already use it).
app.use('/api/v1/admin/notification-templates', notificationTemplateRoutes);
app.use('/api/v1/messaging', messagingRoutes);
// BUG-PHASE18-07 fix — mobile messaging service
// (apps/mobile/src/services/messaging.service.ts) calls /api/v1/conversations
// for list, create, send-message, mark-read, and unread-count. The route
// was only mounted at /api/v1/messaging, so the entire mobile chat feature
// (chat/[id].tsx for both customer and provider, plus the unread-count
// badge) silently 404'd. Adding the alias preserves the existing
// /messaging mount and unblocks mobile without requiring a mobile rebuild.
app.use('/api/v1/conversations', messagingRoutes);
app.use('/api/v1/addresses', addressRoutes);
app.use('/api/v1/referrals', referralRoutes);
app.use('/api/v1/recurring', recurringRoutes);
app.use('/api/v1/projects', projectRoutes);
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

// D-J27 / F#3 fix: Test fixture endpoints for Maestro visual baselines.
// Gated by NODE_ENV !== 'production' AND ENABLE_TEST_FIXTURES=1, so
// production is doubly protected. The router itself returns empty when
// either gate fails, so even an accidental mount can't expose anything.
{
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const testFixtures = require('./routes/test-fixtures.routes');
  if (testFixtures.isFixturesEnabled()) {
    app.use(testFixtures.consumeForceNextErrorMiddleware);
    app.use('/__test', testFixtures.buildTestFixturesRouter());
    logger.warn('Test fixture endpoints MOUNTED at /__test (NODE_ENV != production AND ENABLE_TEST_FIXTURES=1).');
  }
}

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
if (SENTRY_DSN) {
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

  // §35c — start the per-user upload limiter's live-settings refresh loop.
  initUploadRateLimit()
    .then(() => logger.info('Upload rate-limit live config loaded'))
    .catch((err: unknown) => logger.error('Upload rate-limit init failed; using defaults', { error: err }));

  // Initialize background jobs after server is listening
  initScheduledJobs()
    .then(() => logger.info('Scheduled jobs initialized'))
    .catch((err: unknown) => logger.error('Failed to initialize scheduled jobs', { error: err }));

  // MED-N108 fix — boot-time drift check between SETTING_DEFAULTS
  // (in-memory fallback) and platform_settings (DB). Logs warnings
  // for keys missing on either side; never blocks boot.
  settingsService
    .checkSettingsDriftAtBoot()
    .catch((err: unknown) => logger.warn('Settings drift check threw', { error: err }));
});

// Phase C CRIT-50 fix — graceful shutdown on SIGTERM / SIGINT.
//
// Pre-fix: server.ts had no signal handlers, so a Kubernetes / ECS
// rolling restart sent SIGTERM and the process died immediately,
// killing in-flight requests. Webhook deliveries mid-write would
// half-commit; long-running admin reports would 502 to the operator.
//
// Post-fix: on SIGTERM/SIGINT, stop accepting new connections,
// drain in-flight requests with a timeout cap, then exit. The cap
// prevents a stuck handler from blocking the deploy forever — at
// 30 seconds we force-exit and log loudly so ops can investigate.
//
// We register the same handler for both SIGTERM (k8s/ECS standard)
// and SIGINT (Ctrl-C in dev). The handler is idempotent: the
// SHUTTING_DOWN flag ensures multiple signals don't race.
let SHUTTING_DOWN = false;
const SHUTDOWN_TIMEOUT_MS = 30_000;

function gracefulShutdown(signal: NodeJS.Signals): void {
  if (SHUTTING_DOWN) {
    logger.warn(`Received ${signal} during shutdown — ignoring`);
    return;
  }
  SHUTTING_DOWN = true;
  logger.info(`Received ${signal} — beginning graceful shutdown (max ${SHUTDOWN_TIMEOUT_MS}ms)`);

  // Stop accepting new HTTP connections; existing keep-alive sockets
  // are allowed to finish their in-flight request (Node's default
  // behavior for server.close()).
  httpServer.close((err) => {
    if (err) {
      logger.error('httpServer.close errored', { error: err.message });
      process.exit(1);
    }
    logger.info('HTTP server closed cleanly — exiting');
    process.exit(0);
  });

  // Force-exit cap. If a hung handler keeps sockets open past the
  // timeout, exit anyway so the deploy can roll forward.
  const forceExit = setTimeout(() => {
    logger.error(`Graceful shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms — forcing exit`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Don't crash on unhandled rejections; log them. (Otherwise a single
// missed `.catch` blows up the whole process.)
process.on('unhandledRejection', (reason, promise) => {
  logger.error('unhandledRejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: String(promise),
  });
});

process.on('uncaughtException', (err) => {
  // Uncaught exceptions ARE fatal — log loudly then exit so the
  // process supervisor can restart us in a clean state.
  logger.error('uncaughtException — process will exit', {
    message: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

export { httpServer, gracefulShutdown };
export default app;
