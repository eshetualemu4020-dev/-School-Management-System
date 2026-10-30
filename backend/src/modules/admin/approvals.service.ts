import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { pool } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';

export interface ApprovalItem {
  id: number;
  type: string;
  entity_type: string;
  entity_id: number | null;
  requested_by: number;
  requester_name: string;
  requester_username: string;
  old_value_json: any;
  new_value_json: any;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  decided_by: number | null;
  decider_name: string | null;
  decider_username: string | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApprovalsFilter {
  status?: string;
  type?: string;
  requestedBy?: number;
  page?: number;
  limit?: number;
}

export class ApprovalsService {
  /**
   * List approvals with filters and pagination
   */
  async listApprovals(filters: ApprovalsFilter = {}): Promise<{
    items: ApprovalItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(filters.limit) || 20));
    const offset = (page - 1) * limit;

    const whereClauses: string[] = ['a.deleted_at IS NULL'];
    const params: any[] = [];

    if (filters.status && filters.status !== 'all') {
      whereClauses.push('a.status = ?');
      params.push(filters.status);
    }

    if (filters.type && filters.type !== 'all') {
      whereClauses.push('a.type = ?');
      params.push(filters.type);
    }

    if (filters.requestedBy) {
      whereClauses.push('a.requested_by = ?');
      params.push(filters.requestedBy);
    }

    const whereSql = whereClauses.join(' AND ');

    // Total count
    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM approvals a WHERE ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    // Items query with requester and decider details
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
        a.id,
        a.type,
        a.entity_type,
        a.entity_id,
        a.requested_by,
        COALESCE(CONCAT(rst.first_name, ' ', rst.father_name), CONCAT(rstu.first_name, ' ', rstu.father_name), ru.username) AS requester_name,
        ru.username AS requester_username,
        a.old_value_json,
        a.new_value_json,
        a.reason,
        a.status,
        a.decided_by,
        COALESCE(CONCAT(dst.first_name, ' ', dst.father_name), du.username) AS decider_name,
        du.username AS decider_username,
        a.decision_note,
        a.decided_at,
        a.created_at,
        a.updated_at
      FROM approvals a
      JOIN users ru ON a.requested_by = ru.id
      LEFT JOIN staff rst ON ru.id = rst.user_id
      LEFT JOIN students rstu ON ru.id = rstu.user_id
      LEFT JOIN users du ON a.decided_by = du.id
      LEFT JOIN staff dst ON du.id = dst.user_id
      WHERE ${whereSql}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const items: ApprovalItem[] = rows.map((r) => ({
      id: r.id,
      type: r.type,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      requested_by: r.requested_by,
      requester_name: r.requester_name || r.requester_username || `User #${r.requested_by}`,
      requester_username: r.requester_username,
      old_value_json: typeof r.old_value_json === 'string' ? JSON.parse(r.old_value_json) : r.old_value_json,
      new_value_json: typeof r.new_value_json === 'string' ? JSON.parse(r.new_value_json) : r.new_value_json,
      reason: r.reason,
      status: r.status,
      decided_by: r.decided_by,
      decider_name: r.decided_by ? (r.decider_name || r.decider_username || `User #${r.decided_by}`) : null,
      decider_username: r.decider_username,
      decision_note: r.decision_note,
      decided_at: r.decided_at,
      created_at: r.created_at,
      updated_at: r.updated_at
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Summary of pending approvals and breakdown by type
   */
  async getSummary(): Promise<{
    totalPending: number;
    byType: Record<string, number>;
  }> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT type, COUNT(*) as cnt 
       FROM approvals 
       WHERE status = 'pending' AND deleted_at IS NULL 
       GROUP BY type`
    );

    const byType: Record<string, number> = {};
    let totalPending = 0;

    for (const r of rows) {
      const count = Number(r.cnt);
      byType[r.type] = count;
      totalPending += count;
    }

    return {
      totalPending,
      byType
    };
  }

  /**
   * Get single approval details
   */
  async getApprovalById(id: number): Promise<ApprovalItem> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
        a.id,
        a.type,
        a.entity_type,
        a.entity_id,
        a.requested_by,
        COALESCE(CONCAT(rst.first_name, ' ', rst.father_name), CONCAT(rstu.first_name, ' ', rstu.father_name), ru.username) AS requester_name,
        ru.username AS requester_username,
        a.old_value_json,
        a.new_value_json,
        a.reason,
        a.status,
        a.decided_by,
        COALESCE(CONCAT(dst.first_name, ' ', dst.father_name), du.username) AS decider_name,
        du.username AS decider_username,
        a.decision_note,
        a.decided_at,
        a.created_at,
        a.updated_at
      FROM approvals a
      JOIN users ru ON a.requested_by = ru.id
      LEFT JOIN staff rst ON ru.id = rst.user_id
      LEFT JOIN students rstu ON ru.id = rstu.user_id
      LEFT JOIN users du ON a.decided_by = du.id
      LEFT JOIN staff dst ON du.id = dst.user_id
      WHERE a.id = ? AND a.deleted_at IS NULL`,
      [id]
    );

    if (rows.length === 0) {
      throw new AppError('Approval request not found', 404, 'APPROVAL_NOT_FOUND');
    }

    const r = rows[0];
    return {
      id: r.id,
      type: r.type,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      requested_by: r.requested_by,
      requester_name: r.requester_name || r.requester_username || `User #${r.requested_by}`,
      requester_username: r.requester_username,
      old_value_json: typeof r.old_value_json === 'string' ? JSON.parse(r.old_value_json) : r.old_value_json,
      new_value_json: typeof r.new_value_json === 'string' ? JSON.parse(r.new_value_json) : r.new_value_json,
      reason: r.reason,
      status: r.status,
      decided_by: r.decided_by,
      decider_name: r.decided_by ? (r.decider_name || r.decider_username || `User #${r.decided_by}`) : null,
      decider_username: r.decider_username,
      decision_note: r.decision_note,
      decided_at: r.decided_at,
      created_at: r.created_at,
      updated_at: r.updated_at
    };
  }

  /**
   * Submit an approval request
   */
  async createApproval(data: {
    type: string;
    entity_type: string;
    entity_id?: number | null;
    requested_by: number;
    requester_username?: string;
    old_value_json?: any;
    new_value_json: any;
    reason: string;
  }): Promise<{ id: number; message: string }> {
    const validTypes = [
      'attendance_edit_after_lock',
      'result_unlock',
      'student_transfer',
      'student_withdrawal',
      'fee_waiver',
      'payment_void',
      'admission_application'
    ];

    if (!validTypes.includes(data.type)) {
      throw new AppError(`Invalid approval type: ${data.type}`, 400, 'INVALID_APPROVAL_TYPE');
    }

    if (!data.reason || data.reason.trim().length === 0) {
      throw new AppError('A valid reason is required for approval requests', 400, 'REASON_REQUIRED');
    }

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO approvals (
        type, entity_type, entity_id, requested_by,
        old_value_json, new_value_json, reason, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        data.type,
        data.entity_type,
        data.entity_id || null,
        data.requested_by,
        data.old_value_json ? JSON.stringify(data.old_value_json) : null,
        JSON.stringify(data.new_value_json),
        data.reason.trim()
      ]
    );

    const approvalId = result.insertId;

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (
        occurred_at, actor_user_id, actor_username, action,
        entity_type, entity_id, outcome, reason
      ) VALUES (NOW(3), ?, ?, 'approval.request_created', 'approval', ?, 'success', ?)`,
      [
        data.requested_by,
        data.requester_username || 'user',
        approvalId,
        `Submitted approval request for ${data.type}`
      ]
    );

    return {
      id: approvalId,
      message: 'Approval request submitted successfully'
    };
  }

  /**
   * Process and decide an approval (approve or reject)
   */
  async decideApproval(
    id: number,
    decision: { action: 'approve' | 'reject'; decisionNote?: string },
    deciderUserId: number,
    deciderUsername: string
  ): Promise<{ success: boolean; message: string; approval: ApprovalItem }> {
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new AppError('Approval ID must be a positive integer.', 400, 'VALIDATION_ERROR');
    }
    if (!['approve', 'reject'].includes(decision.action)) {
      throw new AppError('Action must be either "approve" or "reject"', 400, 'INVALID_ACTION');
    }
    if (decision.decisionNote !== undefined &&
        (typeof decision.decisionNote !== 'string' || decision.decisionNote.trim().length > 500)) {
      throw new AppError('Decision note must be text of at most 500 characters.', 400, 'VALIDATION_ERROR');
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT * FROM approvals WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
        [id]
      );

      if (rows.length === 0) {
        throw new AppError('Approval request not found', 404, 'APPROVAL_NOT_FOUND');
      }

      const item = rows[0];
      if (item.status !== 'pending') {
        throw new AppError(
          `This request has already been ${item.status}`,
          409,
          'APPROVAL_ALREADY_DECIDED'
        );
      }
      if (item.type === 'admission_application' &&
          (!item.entity_id || !['admission_applications', 'students'].includes(item.entity_type))) {
        throw new AppError('Admission approval is missing a supported application record.', 400, 'INVALID_APPROVAL_ENTITY');
      }

      const newStatus = decision.action === 'approve' ? 'approved' : 'rejected';

      // If approved, apply the business change according to approval type
      if (decision.action === 'approve') {
        const newVal = typeof item.new_value_json === 'string'
          ? JSON.parse(item.new_value_json)
          : item.new_value_json;

        switch (item.type) {
          case 'student_transfer':
            if (item.entity_id) {
              // Update enrollment section if provided or record transfer
              if (newVal.target_section_id) {
                await connection.query(
                  `UPDATE enrollments 
                   SET section_id = ?, updated_at = NOW(3)
                   WHERE student_id = ? AND status = 'active'
                   ORDER BY id DESC LIMIT 1`,
                  [newVal.target_section_id, item.entity_id]
                );
              }
              // Record in transfers_withdrawals if table exists
              await connection.query(
                `INSERT INTO transfers_withdrawals (
                  student_id, type, destination_school, effective_date, reason, approved_by, created_at
                ) VALUES (?, 'transfer_out', ?, COALESCE(?, CURDATE()), ?, ?, NOW(3))`,
                [
                  item.entity_id,
                  newVal.destination_school || 'External Transfer',
                  newVal.effective_date || null,
                  item.reason,
                  deciderUserId
                ]
              ).catch(() => {
                // Non-fatal if table schema details differ
              });
            }
            break;

          case 'student_withdrawal':
            if (item.entity_id) {
              await connection.query(
                `UPDATE students SET status = 'withdrawn', updated_at = NOW(3) WHERE id = ?`,
                [item.entity_id]
              );
              await connection.query(
                `UPDATE enrollments SET status = 'dropped', updated_at = NOW(3) WHERE student_id = ? AND status = 'active'`,
                [item.entity_id]
              );
              await connection.query(
                `INSERT INTO transfers_withdrawals (
                  student_id, type, destination_school, effective_date, reason, approved_by, created_at
                ) VALUES (?, 'withdrawal', ?, COALESCE(?, CURDATE()), ?, ?, NOW(3))`,
                [
                  item.entity_id,
                  newVal.destination_school || 'Withdrawn',
                  newVal.effective_date || null,
                  item.reason,
                  deciderUserId
                ]
              ).catch(() => {});
            }
            break;

          case 'admission_application':
            if (item.entity_id) {
              if (item.entity_type === 'admission_applications') {
                const [applicationUpdate] = await connection.query<ResultSetHeader>(
                  `UPDATE admission_applications
                   SET status = 'approved', decided_by = ?, decision_note = ?, decided_at = NOW(3), updated_at = NOW(3)
                   WHERE id = ? AND status = 'pending_review'`,
                  [deciderUserId, decision.decisionNote || null, item.entity_id]
                );
                if (applicationUpdate.affectedRows !== 1) {
                  throw new AppError('Admission application is missing or no longer awaiting review.', 409, 'ADMISSION_APPLICATION_STATE_CHANGED');
                }
              } else if (item.entity_type === 'students') {
                await connection.query(
                  `UPDATE students SET status = 'active', updated_at = NOW(3) WHERE id = ?`,
                  [item.entity_id]
                );
              } else {
                throw new AppError('Admission approval references an unsupported entity.', 400, 'INVALID_APPROVAL_ENTITY');
              }
            }
            break;

          case 'payment_void':
            if (item.entity_id) {
              await connection.query(
                `UPDATE payments SET status = 'void', updated_at = NOW(3) WHERE id = ?`,
                [item.entity_id]
              ).catch(async () => {
                // If payments table doesn't have status, check reversal
                await connection.query(
                  `INSERT INTO payment_reversals (payment_id, reason, approved_by, created_at)
                   VALUES (?, ?, ?, NOW(3))`,
                  [item.entity_id, item.reason, deciderUserId]
                ).catch(() => {});
              });
            }
            break;

          case 'attendance_edit_after_lock':
            if (item.entity_id) {
              // Unlock attendance session
              await connection.query(
                `UPDATE attendance_sessions 
                 SET is_locked = 0, locked_at = NULL, updated_at = NOW(3) 
                 WHERE id = ?`,
                [item.entity_id]
              ).catch(() => {});
            }
            break;

          case 'result_unlock':
            if (item.entity_id) {
              // If entity is assessment or mark, update lock or status
              await connection.query(
                `UPDATE assessments SET status = 'draft', updated_at = NOW(3) WHERE id = ?`,
                [item.entity_id]
              ).catch(() => {});
            }
            break;

          case 'fee_waiver':
            // Fee waiver recorded as approval
            break;
        }
      }

      if (decision.action === 'reject' && item.type === 'admission_application' &&
          item.entity_type === 'admission_applications' && item.entity_id) {
        const [applicationUpdate] = await connection.query<ResultSetHeader>(
          `UPDATE admission_applications
           SET status = 'rejected', decided_by = ?, decision_note = ?, decided_at = NOW(3), updated_at = NOW(3)
           WHERE id = ? AND status = 'pending_review'`,
          [deciderUserId, decision.decisionNote || null, item.entity_id]
        );
        if (applicationUpdate.affectedRows !== 1) {
          throw new AppError('Admission application is missing or no longer awaiting review.', 409, 'ADMISSION_APPLICATION_STATE_CHANGED');
        }
      }

      if (item.type === 'admission_application' && item.entity_type === 'admission_applications' && item.entity_id) {
        await connection.query(
          `INSERT INTO audit_logs (
            occurred_at, actor_user_id, actor_username, action,
            entity_type, entity_id, outcome, changes, reason
          ) VALUES (NOW(3), ?, ?, ?, 'admission_applications', ?, 'success', ?, ?)`,
          [
            deciderUserId,
            deciderUsername,
            decision.action === 'approve' ? 'admission.application_approved' : 'admission.application_rejected',
            String(item.entity_id),
            JSON.stringify({ approvalId: id, status: newStatus, decisionNote: decision.decisionNote?.trim() || null }),
            decision.decisionNote?.trim() || `Admission application ${newStatus} by system administrator`
          ]
        );
      }

      // Update approval record
      await connection.query(
        `UPDATE approvals
         SET status = ?,
             decided_by = ?,
             decision_note = ?,
             decided_at = NOW(3),
             updated_at = NOW(3)
         WHERE id = ?`,
        [newStatus, deciderUserId, decision.decisionNote || null, id]
      );

      // Audit log
      await connection.query(
        `INSERT INTO audit_logs (
          occurred_at, actor_user_id, actor_username, action,
          entity_type, entity_id, outcome, changes, reason
        ) VALUES (NOW(3), ?, ?, ?, 'approval', ?, 'success', ?, ?)`,
        [
          deciderUserId,
          deciderUsername,
          decision.action === 'approve' ? 'approval.approved' : 'approval.rejected',
          id,
          JSON.stringify({
            previous_status: item.status,
            new_status: newStatus,
            type: item.type,
            decision_note: decision.decisionNote || null
          }),
          decision.decisionNote || `Approval request ${newStatus} by administrator`
        ]
      );

      await connection.commit();

      const updated = await this.getApprovalById(id);

      return {
        success: true,
        message: `Approval request #${id} has been ${newStatus}.`,
        approval: updated
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Cancel an approval request by requester
   */
  async cancelApproval(id: number, userId: number): Promise<{ success: boolean; message: string }> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM approvals WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );

    if (rows.length === 0) {
      throw new AppError('Approval request not found', 404, 'APPROVAL_NOT_FOUND');
    }

    const item = rows[0];
    if (item.requested_by !== userId) {
      throw new AppError('Only the requester can cancel this request', 403, 'FORBIDDEN');
    }

    if (item.status !== 'pending') {
      throw new AppError(`Cannot cancel a request that is already ${item.status}`, 400, 'CANNOT_CANCEL');
    }

    await pool.query(
      `UPDATE approvals SET status = 'cancelled', updated_at = NOW(3) WHERE id = ?`,
      [id]
    );

    return {
      success: true,
      message: 'Approval request cancelled.'
    };
  }
}

export const approvalsService = new ApprovalsService();
