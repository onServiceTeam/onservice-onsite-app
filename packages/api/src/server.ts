import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { errorMiddleware } from './middleware/error.middleware';
import { rateLimitMiddleware } from './middleware/rate-limit.middleware';
import { auditMiddleware } from './middleware/audit.middleware';
import { logger } from './utils/logger';
import { platformConfig } from './config/platform.config';
import { db } from './models/db';
import { redis } from './config/redis.config';
import { initSocketServer } from './services/socket.service';
import * as metricsService from './services/metrics.service';
import { initSentry, closeSentry } from './config/sentry.config';
import { initScheduledJobs } from './jobs/workers';
import authRoutes from './routes/auth.routes';
import bookingRoutes from './routes/booking.routes';
import catalogRoutes from './routes/catalog.routes';
import addressRoutes from './routes/address.routes';
import messagingRoutes from './routes/messaging.routes';
import notificationRoutes from './routes/notification.routes';
import paymentRoutes from './routes/payment.routes';
import walletRoutes from './routes/wallet.routes';
import reviewRoutes from './routes/review.routes';
import providerRoutes from './routes/provider.routes';
import webhookRoutes from './routes/webhook.routes';
import disputeRoutes from './routes/dispute.routes';
import adminRoutes from './routes/admin.routes';
import payoutRoutes from './routes/payout.routes';
import tipRoutes from './routes/tip.routes';
import referralRoutes from './routes/referral.routes';
import sukiRoutes from './routes/suki.routes';
import notificationTemplateRoutes from './routes/notification-template.routes';
import recurringRoutes from './routes/recurring.routes';
import businessRoutes from './routes/business.routes';
import serviceAreaRoutes from './routes/service-area.routes';
import accountRoutes from './routes/account.routes';
import securityRoutes from './routes/security.routes';
import { ipBlockMiddleware } from './middleware/ip-block.middleware';

initSentry();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 7381;

// --- Security Middleware ---
app.use(helmet());

const allowedOrigins = [
  process.env.APP_URL || 'http://localhost:7382',
  process.env.ADMIN_URL || 'http://localhost:7382',
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// --- Body Parsing ---
app.use(express.json({
  limit: '10mb',
  verify: (req: express.Request, _res, buf) => {
    if (req.url?.startsWith('/api/v1/webhooks')) {
      (req as express.Request & { rawBody?: string }).rawBody = buf.toString('utf8');
    }
  },
}));
app.use(express.urlencoded({ extended: true }));

// --- Compression ---
app.use(compression());

// --- Request Logging ---
app.use(morgan('combined', {
  stream: { write: (message: string): void => { logger.info(message.trim()); } },
}));

// --- Health Check (before rate limiting) ---
const startTime = Date.now();

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: platformConfig.appVersion,
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
});

app.get('/health/ready', async (_req, res) => {
  const checks: Record<string, 'ok' | 'fail'> = {};
  try {
    await db.query('SELECT 1');
    checks.database = 'ok';
  } catch {
    checks.database = 'fail';
  }
  try {
    const pong = await redis.ping();
    checks.redis = pong === 'PONG' ? 'ok' : 'fail';
  } catch {
    checks.redis = 'fail';
  }
  const allOk = Object.values(checks).every(v => v === 'ok');
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ready' : 'degraded',
    timestamp: new Date().toISOString(),
    version: platformConfig.appVersion,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks,
  });
});

app.get('/metrics', async (_req, res) => {
  try {
    const snapshot = await metricsService.collectMetrics();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metricsService.toPrometheusFormat(snapshot));
  } catch {
    res.status(500).send('# Error collecting metrics\n');
  }
});

app.get('/metrics/json', async (_req, res) => {
  try {
    const snapshot = await metricsService.collectMetrics();
    res.json({ success: true, data: snapshot });
  } catch {
    res.status(500).json({ success: false, error: { message: 'Failed to collect metrics' } });
  }
});

// --- Rate Limiting ---
app.use(rateLimitMiddleware);

// --- IP Block Check ---
app.use(ipBlockMiddleware);

// --- Audit Logging ---
app.use(auditMiddleware);

// --- API Routes ---
// Sprint 1: Auth + Bookings
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/bookings', bookingRoutes);

// Sprint 2: Catalog + Addresses + Messaging + Notifications
app.use('/api/v1/catalog', catalogRoutes);
app.use('/api/v1/addresses', addressRoutes);
app.use('/api/v1/conversations', messagingRoutes);
app.use('/api/v1/notifications', notificationRoutes);

// Sprint 3: Payments + Wallets + Reviews + Providers + Webhooks
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/wallets', walletRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/providers', providerRoutes);
app.use('/api/v1/webhooks', webhookRoutes);

// Sprint 4: Disputes + Admin Dashboard
app.use('/api/v1/disputes', disputeRoutes);
app.use('/api/v1/admin', adminRoutes);

// Sprint 5: Payouts + Tips + Referrals + Suki Loyalty + Notification Templates
app.use('/api/v1/payouts', payoutRoutes);
app.use('/api/v1/tips', tipRoutes);
app.use('/api/v1/referrals', referralRoutes);
app.use('/api/v1/suki', sukiRoutes);
app.use('/api/v1/admin/notification-templates', notificationTemplateRoutes);

// Phase 5: Recurring Bookings
app.use('/api/v1/recurring', recurringRoutes);

// Phase 5: B2B / Commercial Tier
app.use('/api/v1/business', businessRoutes);

// Phase 5: Geographic Expansion
app.use('/api/v1/service-areas', serviceAreaRoutes);

// Phase 5: Data Management & Privacy (RA 10173 DPA compliance)
app.use('/api/v1/account', accountRoutes);

// Phase 5: Security Enhancements
app.use('/api/v1/security', securityRoutes);

// --- Global Error Handler (must be last) ---
app.use(errorMiddleware);

// --- Socket.io ---
initSocketServer(httpServer);

// --- Start Server ---
httpServer.listen(PORT, () => {
  logger.info(`onService API server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info('Socket.io real-time messaging enabled');

  initScheduledJobs().catch((err) => {
    logger.error('Failed to initialize scheduled jobs', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
  });
});

async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal} — shutting down gracefully`);
  httpServer.close(async () => {
    await closeSentry();
    logger.info('HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => { void gracefulShutdown('SIGTERM'); });
process.on('SIGINT', () => { void gracefulShutdown('SIGINT'); });

export default app;
