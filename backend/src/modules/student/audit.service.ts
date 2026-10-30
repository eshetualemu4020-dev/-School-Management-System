import { pool } from '../../config/database';
import { PoolConnection } from 'mysql2/promise';

export interface AuditEntry {
  actorUserId?: number | null;
  actorUsername?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | number | null;
  outcome?: 'success' | 'failure' | 'denied';
  changes?: any;
  reason?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export class AuditService {
  static async log(entry: AuditEntry, connection?: PoolConnection): Promise<void> {
    const db = connection || pool;
    try {
      await db.query(
        `INSERT INTO audit_logs (
           actor_user_id,
           actor_username,
           action,
           entity_type,
           entity_id,
           outcome,
           changes,
           reason,
           request_id,
           ip_address,
           user_agent
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.actorUserId || null,
          entry.actorUsername || null,
          entry.action,
          entry.entityType || null,
          entry.entityId ? String(entry.entityId) : null,
          entry.outcome || 'success',
          entry.changes ? JSON.stringify(entry.changes) : null,
          entry.reason || null,
          entry.requestId ? String(entry.requestId).slice(0, 36) : null,
          entry.ipAddress || null,
          entry.userAgent ? entry.userAgent.slice(0, 255) : null
        ]
      );
    } catch (err) {
      // Never let an audit write failure crash business transactions, but log it
      console.error('AuditService.log failure:', err);
    }
  }
}
