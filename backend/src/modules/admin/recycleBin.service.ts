import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';

export interface RecycleBinItem {
  id: number;
  entity_type: 'student' | 'staff' | 'section' | 'subject' | 'announcement' | 'book';
  title: string;
  identifier: string | null;
  deleted_at: string;
  deleted_by: number | null;
  deleted_by_username: string | null;
  days_remaining: number;
}

interface EntityConfig {
  table: string;
  titleExpr: string;
  identExpr: string;
}

const ENTITY_CONFIG: Record<string, EntityConfig> = {
  student: {
    table: 'students',
    titleExpr: "CONCAT(t.first_name, ' ', t.father_name)",
    identExpr: 't.admission_no'
  },
  staff: {
    table: 'staff',
    titleExpr: "CONCAT(t.first_name, ' ', t.father_name)",
    identExpr: 't.employee_no'
  },
  section: {
    table: 'sections',
    titleExpr: 't.name',
    identExpr: "COALESCE(t.stream, 'General')"
  },
  subject: {
    table: 'subjects',
    titleExpr: 't.name',
    identExpr: 't.code'
  },
  announcement: {
    table: 'announcements',
    titleExpr: 't.title',
    identExpr: 't.status'
  },
  book: {
    table: 'books',
    titleExpr: 't.title',
    identExpr: 't.isbn'
  }
};

export class RecycleBinService {
  /**
   * Retrieves soft-deleted records across all or specific supported entities
   */
  async getRecycleBinItems(
    entityType?: string,
    page = 1,
    limit = 25
  ): Promise<{ items: RecycleBinItem[]; total: number; page: number; limit: number }> {
    const targetTypes = entityType && ENTITY_CONFIG[entityType]
      ? [entityType]
      : Object.keys(ENTITY_CONFIG);

    const unionQueries: string[] = [];

    for (const type of targetTypes) {
      const cfg = ENTITY_CONFIG[type];
      unionQueries.push(`
        SELECT 
          t.id,
          '${type}' as entity_type,
          ${cfg.titleExpr} as title,
          ${cfg.identExpr} as identifier,
          t.deleted_at,
          t.deleted_by,
          u.username as deleted_by_username,
          GREATEST(0, 30 - DATEDIFF(NOW(), t.deleted_at)) as days_remaining
        FROM \`${cfg.table}\` t
        LEFT JOIN users u ON u.id = t.deleted_by
        WHERE t.deleted_at IS NOT NULL
      `);
    }

    const fullUnion = unionQueries.join(' UNION ALL ');
    const countSql = `SELECT COUNT(*) as total FROM (${fullUnion}) as combined`;
    const [countRows] = await pool.query<RowDataPacket[]>(countSql);
    const total = Number(countRows[0]?.total || 0);

    const offset = (page - 1) * limit;
    const dataSql = `${fullUnion} ORDER BY deleted_at DESC LIMIT ? OFFSET ?`;
    const [items] = await pool.query<RowDataPacket[]>(dataSql, [limit, offset]);

    return {
      items: items as RecycleBinItem[],
      total,
      page,
      limit
    };
  }

  /**
   * Restores a soft-deleted record back to active state
   */
  async restoreItem(
    entityType: string,
    id: number,
    userId: number
  ): Promise<{ success: boolean; message: string }> {
    const cfg = ENTITY_CONFIG[entityType];
    if (!cfg) {
      throw new AppError(`Unsupported entity type: ${entityType}`, 400, 'INVALID_ENTITY_TYPE');
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, ${cfg.titleExpr} as title FROM \`${cfg.table}\` WHERE id = ? AND deleted_at IS NOT NULL`,
      [id]
    );

    if (rows.length === 0) {
      throw new AppError(
        'Item not found in recycle bin or already restored.',
        404,
        'RECYCLE_ITEM_NOT_FOUND'
      );
    }

    await pool.query(
      `UPDATE \`${cfg.table}\` SET deleted_at = NULL, deleted_by = NULL WHERE id = ?`,
      [id]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, reason)
       VALUES (NOW(3), ?, 'admin', 'recycle_bin.restore', ?, ?, 'success', 'Item restored from recycle bin')`,
      [userId, cfg.table, id]
    );

    return {
      success: true,
      message: `Successfully restored ${entityType} "${rows[0].title}".`
    };
  }

  /**
   * Permanently deletes a soft-deleted record
   */
  async purgeItem(
    entityType: string,
    id: number,
    userId: number
  ): Promise<{ success: boolean; message: string }> {
    const cfg = ENTITY_CONFIG[entityType];
    if (!cfg) {
      throw new AppError(`Unsupported entity type: ${entityType}`, 400, 'INVALID_ENTITY_TYPE');
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, ${cfg.titleExpr} as title FROM \`${cfg.table}\` WHERE id = ? AND deleted_at IS NOT NULL`,
      [id]
    );

    if (rows.length === 0) {
      throw new AppError(
        'Item not found in recycle bin or already purged.',
        404,
        'RECYCLE_ITEM_NOT_FOUND'
      );
    }

    const title = rows[0].title;

    await pool.query(`DELETE FROM \`${cfg.table}\` WHERE id = ? AND deleted_at IS NOT NULL`, [id]);

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, reason)
       VALUES (NOW(3), ?, 'admin', 'recycle_bin.purge', ?, ?, 'success', 'Item permanently purged from system')`,
      [userId, cfg.table, id]
    );

    return {
      success: true,
      message: `Permanently purged ${entityType} "${title}".`
    };
  }

  /**
   * Purges all items that have exceeded the 30-day retention window
   */
  async purgeAllExpired(userId: number): Promise<{ purgedCount: number }> {
    let totalPurged = 0;

    for (const type of Object.keys(ENTITY_CONFIG)) {
      const cfg = ENTITY_CONFIG[type];
      const [res] = await pool.query<any>(
        `DELETE FROM \`${cfg.table}\`
         WHERE deleted_at IS NOT NULL
           AND deleted_at < DATE_SUB(NOW(), INTERVAL 30 DAY)`
      );
      totalPurged += res.affectedRows || 0;
    }

    if (totalPurged > 0) {
      await pool.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, outcome, reason)
         VALUES (NOW(3), ?, 'admin', 'recycle_bin.purge_expired', 'system', 'success', ?)`,
        [userId, `Purged ${totalPurged} expired items from recycle bin (>30 days)`]
      );
    }

    return { purgedCount: totalPurged };
  }
}
