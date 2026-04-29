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
import { rateLimitMiddleware } from './middleware/rate-limit.middleware';
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
import * as settingsService from './services/settings.service';
import { db } from './models/db';
import { redis } from './config/redis.config';

const app = express();
const PORT = process.env.PORT || 3001;

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
app.use('/api/v1/admin', adminRoutes);
// Phase 11: end-user compliance endpoints (DSR + consent recording).
app.use('/api/v1/compliance', complianceRoutes);

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

  // Initialize background jobs after server is listening
  initScheduledJobs()
    .then(() => logger.info('Scheduled jobs initialized'))
    .catch((err: unknown) => logger.error('Failed to initialize scheduled jobs', { error: err }));
});

export { httpServer };
export default app;
