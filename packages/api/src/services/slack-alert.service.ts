/**
 * Slack incoming-webhook poster for ops alerts.
 *
 * MED-N120 fix.
 *
 * When `SLACK_ALERT_WEBHOOK_URL` env var is set, sendSlackAlert
 * POSTs the message to that URL. When unset (dev / test / forgot to
 * configure), the function is a no-op that only logs. Either way it
 * NEVER throws — alerting failures must not block the calling code.
 *
 * Send pattern: minimal Block Kit. The caller passes a title (short),
 * a body (multi-line text), and optional fields (key/value pairs
 * rendered side-by-side). Severity drives the color bar.
 */

import { logger } from '../utils/logger';

export type Severity = 'info' | 'warning' | 'error' | 'critical';

export interface SlackAlertInput {
  title: string;
  body: string;
  severity?: Severity;
  fields?: Array<{ key: string; value: string }>;
}

const SEVERITY_EMOJI: Record<Severity, string> = {
  info: ':information_source:',
  warning: ':warning:',
  error: ':rotating_light:',
  critical: ':sos:',
};

export async function sendSlackAlert(input: SlackAlertInput): Promise<void> {
  const webhookUrl = process.env.SLACK_ALERT_WEBHOOK_URL;
  const severity: Severity = input.severity ?? 'warning';

  if (!webhookUrl) {
    logger.debug('SLACK_ALERT_WEBHOOK_URL not set; skipping Slack post', {
      title: input.title, severity,
    });
    return;
  }

  // Block Kit payload. Header + section with body. Fields rendered
  // as a 2-column grid below if provided.
  const blocks: Array<Record<string, unknown>> = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${SEVERITY_EMOJI[severity]} ${input.title}`.slice(0, 150),
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: input.body.slice(0, 3000),
      },
    },
  ];

  if (input.fields && input.fields.length > 0) {
    blocks.push({
      type: 'section',
      fields: input.fields.slice(0, 10).map((f) => ({
        type: 'mrkdwn',
        text: `*${f.key}*\n${f.value}`.slice(0, 2000),
      })),
    });
  }

  try {
    const response = await globalThis.fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    });
    if (!response.ok) {
      logger.warn('Slack alert webhook returned non-2xx', {
        status: response.status,
        title: input.title,
      });
    }
  } catch (err) {
    logger.warn('Slack alert webhook fetch failed', {
      title: input.title,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
