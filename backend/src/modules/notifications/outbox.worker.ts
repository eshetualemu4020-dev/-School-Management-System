import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { pool } from '../../config/database';
import { isEmailDeliveryConfigured, sendNotificationEmail } from '../auth/auth.mailer';

let workerRunning = false;

type OutboxMessage = RowDataPacket & {
  id: number;
  recipient: string;
  subject: string | null;
  payload_json: string | Record<string, unknown>;
  attempts: number;
};

function parsePayload(value: OutboxMessage['payload_json']): Record<string, unknown> {
  if (typeof value === 'string') {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  }
  return value && typeof value === 'object' ? value : {};
}

export async function processNotificationOutboxBatch(): Promise<void> {
  if (workerRunning || !isEmailDeliveryConfigured()) return;
  workerRunning = true;
  let conn: PoolConnection | null = null;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [rows] = await conn.query<OutboxMessage[]>(
      `SELECT id, recipient, subject, payload_json, attempts
       FROM notification_outbox
       WHERE channel = 'email' AND status = 'pending'
         AND (next_attempt_at IS NULL OR next_attempt_at <= NOW(3))
       ORDER BY id ASC LIMIT 2 FOR UPDATE SKIP LOCKED`
    );
    for (const message of rows) {
      const payload = parsePayload(message.payload_json);
      const text = typeof payload.text === 'string' ? payload.text : '';
      const html = typeof payload.html === 'string' ? payload.html : undefined;
      try {
        if (!text && !html) throw new Error('Notification email has no message body.');
        await sendNotificationEmail(message.recipient, message.subject || 'School notification', text || 'Please view this notice in your school account.', html);
        await conn.query(
          `UPDATE notification_outbox SET status = 'sent', attempts = attempts + 1,
           sent_at = NOW(3), next_attempt_at = NULL, last_error = NULL WHERE id = ?`, [message.id]
        );
      } catch (error) {
        const nextAttempt = message.attempts + 1;
        const status = nextAttempt >= 5 ? 'failed' : 'pending';
        const delayMinutes = Math.min(60, 2 ** nextAttempt);
        const safeError = String((error as Error)?.message || 'Email provider rejected the message.').replace(/[\r\n]+/g, ' ').slice(0, 500);
        await conn.query(
          `UPDATE notification_outbox SET status = ?, attempts = ?, last_error = ?,
           next_attempt_at = IF(? = 'pending', DATE_ADD(NOW(3), INTERVAL ? MINUTE), NULL)
           WHERE id = ?`, [status, nextAttempt, safeError, status, delayMinutes, message.id]
        );
      }
    }
    await conn.commit();
  } catch (error) {
    if (conn) await conn.rollback().catch(() => undefined);
    console.error('Notification outbox batch failed:', error);
  } finally {
    conn?.release();
    workerRunning = false;
  }
}

export function startNotificationOutboxWorker(): void {
  if (!isEmailDeliveryConfigured()) {
    console.info('Notification email worker idle: SMTP delivery is not configured. Queued email notifications will remain pending.');
    return;
  }
  void processNotificationOutboxBatch();
  const timer = setInterval(() => void processNotificationOutboxBatch(), 10_000);
  timer.unref();
}
