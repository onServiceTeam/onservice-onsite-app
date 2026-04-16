import { Worker, Queue } from 'bullmq';
import { db } from '../models/db';
import { logger } from '../utils/logger';
import * as escrowService from '../services/escrow.service';
import * as notificationService from '../services/notification.service';
import { platformConfig } from '../config/platform.config';
import { bullMqConnection } from '../config/redis.config';
import * as recurringService from '../services/recurring.service';
import * as invoiceService from '../services/invoice.service';
import * as slotWaitlistService from '../services/slot-waitlist.service';
import * as dataManagementService from '../services/data-management.service';
import * as securityService from '../services/security.service';
import * as adminAnalyticsService from '../services/admin-analytics.service';
import * as disputeService from '../services/dispute.service';

const schedulerQueue = new Queue('scheduler', { connection: bullMqConnection });

interface StaleBookingRow {
  id: string;
  customer_id: string;
  provider_id: string | null;
}

interface ExpiredQuoteRow {
  id: string;
  booking_id: string;
  provider_id: string;
}

interface ExpiringNbiRow {
  user_id: string;
  business_name: string;
  nbi_expiry_date: Date;
  days_until: number;
}

interface NoShowBookingRow {
  id: string;
  customer_id: string;
  provider_id: string | null;
  scheduled_at: Date;
}

async function autoConfirmBookings(): Promise<number> {
  const windowHours = platformConfig.escrowAutoConfirmHours ?? 24;

  const stale = await db.query<StaleBookingRow>(
    `SELECT id, customer_id, provider_id FROM bookings
     WHERE status = 'completed_by_provider'
       AND completed_at < NOW() - INTERVAL '1 hour' * $1`,
    [windowHours],
  );

  let confirmed = 0;
  for (const booking of stale.rows) {
    try {
      const updateResult = await db.query(
        `UPDATE bookings SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status = 'completed_by_provider'`,
        [booking.id],
      );

      if ((updateResult.rowCount ?? 0) === 0) continue;

      try {
        await escrowService.releaseEscrow(booking.id);
      } catch (escrowErr) {
        await db.query(
          `UPDATE bookings SET status = 'completed_by_provider', confirmed_at = NULL, updated_at = NOW()
           WHERE id = $1 AND status = 'confirmed'`,
          [booking.id],
        );
        throw escrowErr;
      }

      try {
        await db.query(
          `UPDATE bookings SET status = 'payout_ready', updated_at = NOW()
           WHERE id = $1 AND status = 'confirmed'`,
          [booking.id],
        );
      } catch (statusErr) {
        logger.error('Post-escrow status update failed — escrow released but booking stuck at confirmed', {
          bookingId: booking.id,
          error: statusErr instanceof Error ? statusErr.message : 'Unknown',
        });
      }

      await notificationService.createNotification({
        userId: booking.customer_id,
        type: 'auto_confirmed',
        title: 'Booking Auto-Confirmed',
        body: `Your booking was automatically confirmed after ${windowHours} hours. Payment has been released to the provider.`,
        data: { bookingId: booking.id },
      });

      confirmed++;
      logger.info('Auto-confirmed booking', { bookingId: booking.id });
    } catch (err) {
      logger.error('Auto-confirm failed for booking', {
        bookingId: booking.id,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }

  return confirmed;
}

async function expireStaleQuotes(): Promise<number> {
  const quoteExpiryHours = platformConfig.quoteExpiryHours ?? 48;

  const expired = await db.query<ExpiredQuoteRow>(
    `UPDATE booking_quotes
     SET status = 'expired', updated_at = NOW()
     WHERE status = 'submitted'
       AND created_at < NOW() - INTERVAL '1 hour' * $1
     RETURNING id, booking_id, provider_id`,
    [quoteExpiryHours],
  );

  for (const quote of expired.rows) {
    try {
      const providerUser = await db.query<{ user_id: string }>(
        `SELECT user_id FROM providers WHERE id = $1`,
        [quote.provider_id],
      );
      if (providerUser.rows[0]) {
        await notificationService.createNotification({
          userId: providerUser.rows[0].user_id,
          type: 'quote_expired',
          title: 'Quote Expired',
          body: 'Your quote was not accepted within the time limit and has expired.',
          data: { bookingId: quote.booking_id, quoteId: quote.id },
        });
      }
    } catch (err) {
      logger.error('Failed to notify quote expiry', {
        quoteId: quote.id,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }

  return expired.rows.length;
}

async function checkNbiExpiry(): Promise<number> {
  const expiringProviders = await db.query<ExpiringNbiRow>(
    `SELECT p.user_id, p.business_name, p.nbi_expiry_date,
            EXTRACT(DAY FROM p.nbi_expiry_date - NOW())::int AS days_until
     FROM providers p
     WHERE p.nbi_expiry_date IS NOT NULL
       AND p.nbi_expiry_date < NOW() + INTERVAL '30 days'
       AND p.nbi_expiry_notified = FALSE
       AND p.status = 'approved'`,
  );

  for (const provider of expiringProviders.rows) {
    try {
      const daysLeft = Math.max(0, provider.days_until);
      const isExpired = daysLeft <= 0;

      await notificationService.createNotification({
        userId: provider.user_id,
        type: 'nbi_expiring',
        title: isExpired ? 'NBI Clearance Expired' : 'NBI Clearance Expiring Soon',
        body: isExpired
          ? 'Your NBI clearance has expired. Please upload a new one to continue accepting jobs.'
          : `Your NBI clearance expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Please renew it soon.`,
        data: { expiryDate: provider.nbi_expiry_date, daysLeft },
      });

      await db.query(
        `UPDATE providers SET nbi_expiry_notified = TRUE WHERE user_id = $1`,
        [provider.user_id],
      );

      if (isExpired) {
        await db.query(
          `UPDATE providers SET status = 'suspended' WHERE user_id = $1 AND status = 'approved'`,
          [provider.user_id],
        );
        logger.warn('Provider suspended due to expired NBI', { userId: provider.user_id });
      }

      logger.info('NBI expiry notification sent', { userId: provider.user_id, daysLeft });
    } catch (err) {
      logger.error('NBI check failed for provider', {
        userId: provider.user_id,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }

  return expiringProviders.rows.length;
}

async function detectNoShows(): Promise<number> {
  const noShowMinutes = platformConfig.providerNoShowMinutes ?? 30;

  const noShows = await db.query<NoShowBookingRow>(
    `SELECT b.id, b.customer_id, b.provider_id, b.scheduled_at FROM bookings b
     WHERE b.status = 'paid'
       AND b.scheduled_at < NOW() - INTERVAL '1 minute' * $1
       AND NOT EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.user_id = b.customer_id
           AND (n.data->>'bookingId') = b.id::text
           AND (n.data->>'noShowAlert')::text = 'true'
       )`,
    [noShowMinutes],
  );

  let flagged = 0;
  for (const booking of noShows.rows) {
    try {
      await notificationService.createNotification({
        userId: booking.customer_id,
        type: 'provider_en_route',
        title: 'Provider May Be Late',
        body: `Your provider hasn't checked in yet. You can wait or cancel for a full refund.`,
        data: { bookingId: booking.id, scheduledAt: booking.scheduled_at, noShowAlert: true },
      });

      if (booking.provider_id) {
        const providerUser = await db.query<{ user_id: string }>(
          `SELECT user_id FROM providers WHERE id = $1`,
          [booking.provider_id],
        );
        if (providerUser.rows[0]) {
          await notificationService.createNotification({
            userId: providerUser.rows[0].user_id,
            type: 'new_job_available',
            title: 'Check-In Reminder',
            body: 'You are past your scheduled time. Please check in or contact the customer.',
            data: { bookingId: booking.id, noShowAlert: true },
          });
        }
      }

      flagged++;
      logger.warn('No-show detected', { bookingId: booking.id });
    } catch (err) {
      logger.error('No-show detection failed', {
        bookingId: booking.id,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }

  return flagged;
}

interface BypassMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
}

interface ConversationBookingRow {
  booking_id: string;
}

const BYPASS_PATTERNS = [
  /(?:\+?63|0)9\d{2}[\s.-]?\d{3}[\s.-]?\d{4}/gi,
  /\b(?:gcash|g-cash|maya|paymaya|send\s*money|direct\s*pay|bank\s*transfer)\b/gi,
  /\b(?:meet\s*(?:me\s*)?(?:outside|privately|directly)|(?:pay|bayad)\s*(?:ko|kita)\s*(?:na\s*lang|directly))\b/gi,
  /\b\d{10,16}\b/g,
  /\b(?:pm\s*(?:mo|ko|lang)|direct\s*message|inbox\s*(?:mo|ko|lang))\b/gi,
  /\b(?:text\s*(?:mo|ko)\s*(?:na\s*lang)?|tawag\s*(?:mo|ko))\b/gi,
  /\b(?:sa\s*labas|off[\s-]?(?:app|platform))\b/gi,
  /\b(?:viber|telegram|signal|whatsapp)\b/gi,
  /\b(?:bdo|bpi|metrobank|unionbank|landbank|rcbc)\s*(?:account|savings|acct)\b/gi,
  /\b(?:bayad\s*(?:ko|kita)\s*(?:na\s*lang|directly))\b/gi,
];

async function detectBypassAttempts(): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const messages = await db.query<BypassMessageRow>(
    `SELECT m.id, m.conversation_id, m.sender_id, m.content
     FROM messages m
     WHERE m.is_flagged = FALSE
       AND m.message_type = 'text'
       AND m.created_at > $1
       AND LENGTH(m.content) > 5`,
    [sevenDaysAgo],
  );

  let flagged = 0;
  for (const msg of messages.rows) {
    const matchedPatterns: string[] = [];
    for (const pattern of BYPASS_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(msg.content)) {
        matchedPatterns.push(pattern.source.slice(0, 40));
      }
    }

    if (matchedPatterns.length === 0) continue;

    try {
      await db.query(
        `UPDATE messages SET is_flagged = TRUE WHERE id = $1`,
        [msg.id],
      );

      const conv = await db.query<ConversationBookingRow>(
        `SELECT booking_id FROM conversations WHERE id = $1`,
        [msg.conversation_id],
      );

      logger.warn('Potential platform bypass detected', {
        messageId: msg.id,
        senderId: msg.sender_id,
        bookingId: conv.rows[0]?.booking_id,
        patterns: matchedPatterns,
      });

      flagged++;
    } catch (err) {
      logger.error('Bypass detection failed for message', {
        messageId: msg.id,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }

  if (flagged > 0) {
    const admins = await db.query<{ id: string }>(
      `SELECT id FROM users WHERE role IN ('admin', 'super_admin') AND is_active = TRUE LIMIT 5`,
    );
    for (const admin of admins.rows) {
      await notificationService.createNotification({
        userId: admin.id,
        type: 'dispute_update',
        title: 'Bypass Detection Report',
        body: `${flagged} message${flagged > 1 ? 's' : ''} flagged for potential platform bypass this week. Review in admin panel.`,
        data: { flaggedCount: flagged, reportDate: new Date().toISOString() },
      });
    }
  }

  return flagged;
}

const schedulerWorker = new Worker(
  'scheduler',
  async (job) => {
    const results: Record<string, unknown> = {};

    switch (job.name) {
      case 'auto-confirm':
        results.confirmed = await autoConfirmBookings();
        break;
      case 'expire-quotes':
        results.expired = await expireStaleQuotes();
        break;
      case 'nbi-check':
        results.notified = await checkNbiExpiry();
        break;
      case 'no-show-detect':
        results.flagged = await detectNoShows();
        break;
      case 'bypass-detect':
        results.bypasses = await detectBypassAttempts();
        break;
      case 'recurring-process':
        results.recurring = await recurringService.processRecurringBookings();
        break;
      case 'invoice-generate':
        results.invoicesGenerated = await invoiceService.generateMonthlyInvoices();
        break;
      case 'invoice-overdue':
        results.overdueInvoices = await invoiceService.checkOverdueInvoices();
        break;
      case 'slot-waitlist-expire':
        results.expiredWaitlist = await slotWaitlistService.expireOldWaitlistEntries();
        break;
      case 'data-export-process': {
        const pendingCount = await dataManagementService.getPendingExportCount();
        if (pendingCount > 0) {
          const pendingExports = await db.query<{ id: string }>(
            `SELECT id FROM data_export_requests WHERE status = 'pending' ORDER BY created_at ASC LIMIT 5`,
          );
          for (const row of pendingExports.rows) {
            await dataManagementService.processDataExport(row.id);
          }
          results.exportsProcessed = pendingExports.rows.length;
        }
        results.exportsExpired = await dataManagementService.expireOldExports();
        break;
      }
      case 'account-deletion-process':
        results.deletionsProcessed = await dataManagementService.processExpiredCoolingOff();
        break;
      case 'security-ip-detect':
        results.ipsBlocked = await securityService.detectSuspiciousIps();
        results.ipsExpired = await securityService.expireBlockedIps();
        break;
      case 'security-cleanup':
        results.loginAttemptsDeleted = await securityService.cleanupOldLoginAttempts();
        break;
      case 'quality-score-compute':
        results.qualityScoresComputed = await adminAnalyticsService.computeProviderQualityScores(90);
        break;
      case 'dispute-escalate':
        results.disputesEscalated = await disputeService.autoEscalateStaleDisputes();
        break;
      case 'all': {
        results.confirmed = await autoConfirmBookings();
        results.expired = await expireStaleQuotes();
        results.flagged = await detectNoShows();
        results.disputesEscalated = await disputeService.autoEscalateStaleDisputes();
        break;
      }
      default:
        logger.warn('Unknown scheduler job', { name: job.name });
    }

    logger.info('Scheduler job completed', { name: job.name, results });
    return results;
  },
  { connection: bullMqConnection, concurrency: 1 },
);

schedulerWorker.on('failed', (job, err) => {
  logger.error('Scheduler job failed', { name: job?.name, error: err.message });
});

export async function initScheduledJobs(): Promise<void> {
  const existingRepeatableJobs = await schedulerQueue.getRepeatableJobs();
  for (const job of existingRepeatableJobs) {
    await schedulerQueue.removeRepeatableByKey(job.key);
  }

  await schedulerQueue.add('all', {}, {
    repeat: { pattern: '*/5 * * * *' },
    removeOnComplete: 50,
    removeOnFail: 100,
  });

  await schedulerQueue.add('nbi-check', {}, {
    repeat: { pattern: '0 16 * * *' },
    removeOnComplete: 10,
    removeOnFail: 30,
  });

  await schedulerQueue.add('bypass-detect', {}, {
    repeat: { pattern: '0 16 * * 0' },
    removeOnComplete: 10,
    removeOnFail: 10,
  });

  await schedulerQueue.add('recurring-process', {}, {
    repeat: { pattern: '0 22 * * *' },
    removeOnComplete: 30,
    removeOnFail: 30,
  });

  await schedulerQueue.add('invoice-generate', {}, {
    repeat: { pattern: '0 16 1 * *' },
    removeOnComplete: 10,
    removeOnFail: 10,
  });

  await schedulerQueue.add('invoice-overdue', {}, {
    repeat: { pattern: '0 16 * * *' },
    removeOnComplete: 10,
    removeOnFail: 10,
  });

  await schedulerQueue.add('slot-waitlist-expire', {}, {
    repeat: { pattern: '0 17 * * *' },
    removeOnComplete: 10,
    removeOnFail: 10,
  });

  await schedulerQueue.add('data-export-process', {}, {
    repeat: { pattern: '*/10 * * * *' },
    removeOnComplete: 30,
    removeOnFail: 30,
  });

  await schedulerQueue.add('account-deletion-process', {}, {
    repeat: { pattern: '0 18 * * *' },
    removeOnComplete: 10,
    removeOnFail: 10,
  });

  await schedulerQueue.add('security-ip-detect', {}, {
    repeat: { pattern: '*/5 * * * *' },
    removeOnComplete: 30,
    removeOnFail: 30,
  });

  await schedulerQueue.add('security-cleanup', {}, {
    repeat: { pattern: '0 19 1 * *' },
    removeOnComplete: 10,
    removeOnFail: 10,
  });

  await schedulerQueue.add('quality-score-compute', {}, {
    repeat: { pattern: '0 20 * * 0' },
    removeOnComplete: 10,
    removeOnFail: 10,
  });

  await schedulerQueue.add('dispute-escalate', {}, {
    repeat: { pattern: '0 */6 * * *' },
    removeOnComplete: 30,
    removeOnFail: 30,
  });

  logger.info('Scheduled jobs initialized: auto-confirm/expire-quotes/no-show/dispute-escalate every 5 min (all), NBI check daily midnight PHT, bypass detection weekly Sunday midnight PHT, recurring bookings daily 6AM PHT, invoice generation 1st of month midnight PHT, overdue check daily midnight PHT, slot waitlist expiry daily 1AM PHT, data export processing every 10 min, account deletion processing daily 2AM PHT, suspicious IP detection every 5 min, security cleanup monthly 3AM PHT, quality score compute weekly 4AM PHT Monday, dispute escalation every 6 hours');
}

export { schedulerWorker };
