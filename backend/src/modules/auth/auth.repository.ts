import { pool } from '../../config/database';
import { RowDataPacket, ResultSetHeader, PoolConnection } from 'mysql2/promise';
import { AppError } from '../../middleware/errorHandler';

export interface UserRow extends RowDataPacket {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  status: 'invited' | 'active' | 'disabled' | 'locked';
  locked_until: Date | null;
  must_change_password: number;
}

export interface PublicRegistrationInput {
  role: 'student' | 'guardian' | 'teacher' | 'registrar' | 'librarian' | 'administrator';
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  password: string;
  idNumber?: string;
}

export class AuthRepository {
  async findByIdentifier(identifier: string): Promise<UserRow | null> {
    const [rows] = await pool.query<UserRow[]>(
      `SELECT id, username, email, password_hash, status, locked_until, must_change_password
       FROM users
       WHERE username = ? OR email = ?
       LIMIT 1`,
      [identifier, identifier]
    );
    return rows[0] || null;
  }

  async activateUser(userId: number): Promise<void> {
    await pool.query(`UPDATE users SET status = 'active' WHERE id = ?`, [userId]);
  }

  async createPublicAccount(payload: PublicRegistrationInput & { passwordHash: string; accountStatus: 'active' | 'invited' }): Promise<{ id: number; username: string; email: string; role: string }> {
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      // Only the email must be unique. A taken *base* username is not an error:
      // generateUniqueUsername() will append a numeric suffix below.
      const [duplicate] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM users WHERE email = ? LIMIT 1`,
        [payload.email.trim().toLowerCase()]
      );

      if (duplicate.length > 0) {
        throw new AppError('A user with this email already exists.', 409, 'DUPLICATE_EMAIL');
      }

      const username = await this.generateUniqueUsername(conn, payload.firstName, payload.lastName);
      const roleCode = this.getRoleCode(payload.role);
      const [roleRows] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM roles WHERE code = ? LIMIT 1`,
        [roleCode]
      );

      if (roleRows.length === 0) {
        throw new AppError(`Unsupported registration role: ${payload.role}.`, 400, 'INVALID_ROLE');
      }

      const email = payload.email.trim().toLowerCase();
      const [userRes] = await conn.query<ResultSetHeader>(
        `INSERT INTO users (username, email, phone, password_hash, status, must_change_password)
         VALUES (?, ?, ?, ?, ?, 0)`,
        [username, email, payload.phone?.trim() || null, payload.passwordHash, payload.accountStatus]
      );

      const userId = userRes.insertId;

      await conn.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`,
        [userId, roleRows[0].id]
      );

      const normalizedPhone = payload.phone?.trim() || `+2519${String(userId).padStart(8, '0')}`;
      const firstName = payload.firstName.trim();
      const lastName = payload.lastName.trim();
      const personName = `${firstName} ${lastName}`;

      if (roleCode === 'student') {
        const admissionNo = (payload.idNumber || `ST-${new Date().getFullYear()}-${String(userId).padStart(6, '0')}`).trim();
        const [admissionCheck] = await conn.query<RowDataPacket[]>(
          `SELECT id FROM students WHERE admission_no = ? LIMIT 1`,
          [admissionNo]
        );

        if (admissionCheck.length > 0) {
          throw new AppError(`Admission number '${admissionNo}' is already in use.`, 409, 'DUPLICATE_ADMISSION_NO');
        }

        await conn.query(
          `INSERT INTO students (user_id, admission_no, first_name, father_name, gender, date_of_birth, phone, email, admission_date, status)
           VALUES (?, ?, ?, ?, 'male', DATE_SUB(CURDATE(), INTERVAL 16 YEAR), ?, ?, CURDATE(), 'active')`,
          [userId, admissionNo, firstName, lastName, normalizedPhone, email]
        );
      } else if (roleCode === 'guardian') {
        await conn.query(
          `INSERT INTO guardians (user_id, first_name, father_name, phone, email, verification_status)
           VALUES (?, ?, ?, ?, ?, 'pending')`,
          [userId, firstName, lastName, normalizedPhone, email]
        );
      } else {
        const employeeNo = (payload.idNumber || `EMP-${new Date().getFullYear()}-${String(userId).padStart(6, '0')}`).trim();
        const [staffCheck] = await conn.query<RowDataPacket[]>(
          `SELECT id FROM staff WHERE employee_no = ? LIMIT 1`,
          [employeeNo]
        );

        if (staffCheck.length > 0) {
          throw new AppError(`Employee number '${employeeNo}' is already in use.`, 409, 'DUPLICATE_EMPLOYEE_NO');
        }

        const jobTitle =
          roleCode === 'teacher' ? 'Teacher' :
          roleCode === 'registrar' ? 'Registrar' :
          roleCode === 'librarian' ? 'Librarian' :
          'Administrator';
        const department =
          roleCode === 'teacher' ? 'Academics' :
          roleCode === 'librarian' ? 'Library' :
          'Administration';
        const staffType = this.getStaffType(roleCode);

        await conn.query(
          `INSERT INTO staff (user_id, employee_no, first_name, father_name, gender, phone, email, job_title, department, staff_type, hire_date, status)
           VALUES (?, ?, ?, ?, 'male', ?, ?, ?, ?, ?, CURDATE(), 'active')`,
          [userId, employeeNo, firstName, lastName, normalizedPhone, email, jobTitle, department, staffType]
        );
      }

      await conn.commit();
      return { id: userId, username, email, role: roleCode };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  private getRoleCode(role: PublicRegistrationInput['role']): string {
    switch (role) {
      case 'teacher':
        return 'teacher';
      case 'registrar':
        return 'registrar';
      case 'librarian':
        return 'librarian';
      case 'guardian':
        return 'guardian';
      // The system has no literal 'administrator' role; its privileged admin role
      // is 'system_admin' ("System Administrator"). Map the public label onto it.
      case 'administrator':
        return 'system_admin';
      case 'student':
      default:
        return 'student';
    }
  }

  /**
   * Maps a registration role to a valid `staff.staff_type` enum value.
   * The enum is ('teacher','administrator','support','librarian','accountant','other'),
   * so role codes such as 'registrar' cannot be stored as-is.
   */
  private getStaffType(roleCode: string): string {
    switch (roleCode) {
      case 'teacher':
        return 'teacher';
      case 'librarian':
        return 'librarian';
      case 'registrar':
        return 'administrator';
      default:
        return 'administrator';
    }
  }

  private buildUsername(firstName: string, lastName: string): string {
    const cleanFirst = firstName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    const cleanLast = lastName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    return `${cleanFirst}.${cleanLast}`.slice(0, 60) || 'new.user';
  }

  private async generateUniqueUsername(conn: PoolConnection, firstName: string, lastName: string): Promise<string> {
    let username = this.buildUsername(firstName, lastName);
    let counter = 1;

    while (true) {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM users WHERE username = ? LIMIT 1`,
        [username]
      );

      if (rows.length === 0) {
        return username;
      }

      username = `${this.buildUsername(firstName, lastName)}${counter}`;
      counter += 1;
    }
  }

  async getUserRoles(userId: number): Promise<string[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT r.code 
       FROM user_roles ur 
       JOIN roles r ON ur.role_id = r.id 
       WHERE ur.user_id = ?`,
      [userId]
    );
    return rows.map((r) => r.code);
  }

  async getUserPermissions(userId: number): Promise<string[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT DISTINCT p.code 
       FROM user_roles ur 
       JOIN role_permissions rp ON ur.role_id = rp.role_id 
       JOIN permissions p ON rp.permission_id = p.id 
       WHERE ur.user_id = ?`,
      [userId]
    );
    return rows.map((p) => p.code);
  }

  async getStaffProfile(userId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, employee_no, first_name, father_name, grandfather_name, job_title, department, staff_type, status 
       FROM staff 
       WHERE user_id = ?`,
      [userId]
    );
    return rows[0] || null;
  }

  async updatePassword(userId: number, passwordHash: string): Promise<void> {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `UPDATE users SET password_hash = ?, password_changed_at = NOW(3), must_change_password = 0,
         failed_login_count = 0, locked_until = NULL WHERE id = ?`,
        [passwordHash, userId]
      );
      await conn.query(
        `UPDATE refresh_sessions SET revoked_at = NOW(3), revoked_reason = 'password_change'
         WHERE user_id = ? AND revoked_at IS NULL`,
        [userId]
      );
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async updateLastLogin(userId: number): Promise<void> {
    await pool.query(
      `UPDATE users SET last_login_at = NOW(3), failed_login_count = 0, locked_until = NULL WHERE id = ?`,
      [userId]
    );
  }

  async recordFailedLogin(userId: number): Promise<void> {
    await pool.query(
      `UPDATE users
       SET failed_login_count = CASE
             WHEN locked_until IS NOT NULL AND locked_until <= NOW(3) THEN 1
             ELSE LEAST(failed_login_count + 1, 65535)
           END,
           locked_until = CASE
             WHEN locked_until IS NOT NULL AND locked_until <= NOW(3) THEN NULL
             WHEN failed_login_count + 1 >= 5 THEN DATE_ADD(NOW(3), INTERVAL 15 MINUTE)
             ELSE locked_until
           END
       WHERE id = ?`,
      [userId]
    );
  }

  async createSession(
    userId: number,
    tokenHash: string,
    expiresAt: Date,
    ipAddress: string | null,
    userAgent: string | null
  ): Promise<void> {
    await pool.query(
      `INSERT INTO refresh_sessions (user_id, token_hash, family_id, expires_at, ip_address, user_agent)
       VALUES (?, ?, UUID(), ?, ?, ?)`,
      [userId, tokenHash, expiresAt, ipAddress, userAgent]
    );
  }

  async revokeSession(tokenHash: string): Promise<void> {
    await pool.query(
      `UPDATE refresh_sessions SET revoked_at = NOW(3), revoked_reason = 'logout'
       WHERE token_hash = ? AND revoked_at IS NULL`,
      [tokenHash]
    );
  }

  async recordAuthenticationEvent(
    userId: number | null,
    username: string,
    action: string,
    outcome: 'success' | 'failure' | 'denied',
    ipAddress: string | null,
    userAgent: string | null,
    requestId: string | null
  ): Promise<void> {
    await pool.query(
      `INSERT INTO audit_logs
       (actor_user_id, actor_username, action, entity_type, entity_id, outcome, request_id, ip_address, user_agent)
       VALUES (?, ?, ?, 'authentication', ?, ?, ?, ?, ?)`,
      [userId, username.slice(0, 60), action, userId === null ? null : String(userId), outcome, requestId?.slice(0, 36) ?? null, ipAddress, userAgent?.slice(0, 255) ?? null]
    );
  }

  async createPasswordResetToken(userId: number, tokenHash: string, requestedIp: string | null): Promise<void> {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `UPDATE password_reset_tokens SET used_at = NOW(3) WHERE user_id = ? AND used_at IS NULL`,
        [userId]
      );
      await conn.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, requested_ip, expires_at)
         VALUES (?, ?, ?, DATE_ADD(NOW(3), INTERVAL 15 MINUTE))`,
        [userId, tokenHash, requestedIp]
      );
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async deletePasswordResetToken(tokenHash: string): Promise<void> {
    await pool.query(`DELETE FROM password_reset_tokens WHERE token_hash = ?`, [tokenHash]);
  }

  async consumePasswordResetToken(tokenHash: string, passwordHash: string): Promise<void> {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, user_id FROM password_reset_tokens
         WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW(3) FOR UPDATE`,
        [tokenHash]
      );
      if (!rows[0]) {
        throw new AppError('Password reset token is invalid or expired.', 400, 'INVALID_RESET_TOKEN');
      }

      const userId = rows[0].user_id;
      const [updatedUser] = await conn.query<ResultSetHeader>(
        `UPDATE users SET password_hash = ?, password_changed_at = NOW(3), must_change_password = 0,
         failed_login_count = 0, locked_until = NULL WHERE id = ? AND status = 'active'`,
        [passwordHash, userId]
      );
      if (updatedUser.affectedRows !== 1) {
        throw new AppError('Password reset token is invalid or expired.', 400, 'INVALID_RESET_TOKEN');
      }
      const [updated] = await conn.query<ResultSetHeader>(
        `UPDATE password_reset_tokens SET used_at = NOW(3) WHERE id = ? AND used_at IS NULL`,
        [rows[0].id]
      );
      if (updated.affectedRows !== 1) {
        throw new AppError('Password reset token is invalid or expired.', 400, 'INVALID_RESET_TOKEN');
      }
      await conn.query(
        `UPDATE refresh_sessions SET revoked_at = NOW(3), revoked_reason = 'password_change'
         WHERE user_id = ? AND revoked_at IS NULL`,
        [userId]
      );
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  // -------------------------------------------------------------------------
  // PACKAGE 6: SECURITY - LOGIN ATTEMPTS
  // -------------------------------------------------------------------------
  async recordLoginAttempt(
    userId: number | null,
    username: string,
    ipAddress: string | null,
    userAgent: string | null,
    success: boolean,
    failureReason: string | null
  ): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO login_attempts (user_id, username, ip_address, user_agent, success, failure_reason)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userId,
          username.slice(0, 190),
          ipAddress ? ipAddress.slice(0, 45) : null,
          userAgent ? userAgent.slice(0, 255) : null,
          success ? 1 : 0,
          failureReason ? failureReason.slice(0, 100) : null
        ]
      );
    } catch (err) {
      console.error('Failed to log login attempt:', err);
    }
  }

  async getLoginAttempts(params: {
    page?: number;
    limit?: number;
    username?: string;
    success?: boolean;
    startDate?: string;
    endDate?: string;
  }): Promise<{ attempts: any[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: any[] = [];

    if (params.username) {
      conditions.push(`(la.username LIKE ? OR u.email LIKE ?)`);
      values.push(`%${params.username}%`, `%${params.username}%`);
    }

    if (params.success !== undefined) {
      conditions.push(`la.success = ?`);
      values.push(params.success ? 1 : 0);
    }

    if (params.startDate) {
      conditions.push(`la.created_at >= ?`);
      values.push(new Date(params.startDate));
    }

    if (params.endDate) {
      conditions.push(`la.created_at <= ?`);
      values.push(new Date(params.endDate));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total
       FROM login_attempts la
       LEFT JOIN users u ON la.user_id = u.id
       ${whereClause}`,
      values
    );
    const total = Number(countRows[0]?.total || 0);

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         la.id,
         la.user_id as userId,
         la.username,
         u.email,
         la.ip_address as ipAddress,
         la.user_agent as userAgent,
         la.success,
         la.failure_reason as failureReason,
         la.created_at as createdAt
       FROM login_attempts la
       LEFT JOIN users u ON la.user_id = u.id
       ${whereClause}
       ORDER BY la.created_at DESC
       LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );

    return { attempts: rows, total, page, limit };
  }

  async unlockUser(userId: number): Promise<boolean> {
    const [res] = await pool.query<ResultSetHeader>(
      `UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?`,
      [userId]
    );
    return res.affectedRows > 0;
  }

  // -------------------------------------------------------------------------
  // PACKAGE 6: SECURITY - ACTIVE SESSIONS
  // -------------------------------------------------------------------------
  async getUserSessions(userId?: number, activeOnly: boolean = true): Promise<any[]> {
    const conditions: string[] = [];
    const values: any[] = [];

    if (userId) {
      conditions.push(`s.user_id = ?`);
      values.push(userId);
    }

    if (activeOnly) {
      conditions.push(`s.revoked_at IS NULL AND s.expires_at > NOW(3)`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         s.id,
         s.user_id as userId,
         u.username,
         u.email,
         s.ip_address as ipAddress,
         s.user_agent as userAgent,
         s.issued_at as issuedAt,
         s.last_seen_at as lastSeenAt,
         s.expires_at as expiresAt,
         s.revoked_at as revokedAt,
         s.revoked_reason as revokedReason
       FROM refresh_sessions s
       JOIN users u ON s.user_id = u.id
       ${whereClause}
       ORDER BY COALESCE(s.last_seen_at, s.issued_at) DESC`,
      values
    );

    return rows;
  }

  async revokeSessionById(sessionId: number, revokedReason: string = 'admin_revoked'): Promise<boolean> {
    const [res] = await pool.query<ResultSetHeader>(
      `UPDATE refresh_sessions 
       SET revoked_at = NOW(3), revoked_reason = ? 
       WHERE id = ? AND revoked_at IS NULL`,
      [revokedReason, sessionId]
    );
    return res.affectedRows > 0;
  }

  async revokeAllUserSessions(userId: number, exceptTokenHash?: string, revokedReason: string = 'revoked_all'): Promise<number> {
    const conditions = [`user_id = ?`, `revoked_at IS NULL`];
    const values: any[] = [revokedReason, userId];

    if (exceptTokenHash) {
      conditions.push(`token_hash != ?`);
      values.push(exceptTokenHash);
    }

    const [res] = await pool.query<ResultSetHeader>(
      `UPDATE refresh_sessions 
       SET revoked_at = NOW(3), revoked_reason = ? 
       WHERE ${conditions.join(' AND ')}`,
      values
    );
    return res.affectedRows;
  }

  // -------------------------------------------------------------------------
  // PACKAGE 6: SECURITY - TWO FACTOR AUTHENTICATION (TOTP)
  // -------------------------------------------------------------------------
  async getUserTwoFactor(userId: number): Promise<RowDataPacket | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, user_id, secret_encrypted, backup_codes_json, is_enabled, enabled_at 
       FROM user_two_factor 
       WHERE user_id = ? 
       LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  }

  async saveTwoFactorSetup(userId: number, secretEncrypted: string, backupCodesJson: string): Promise<void> {
    await pool.query(
      `INSERT INTO user_two_factor (user_id, secret_encrypted, backup_codes_json, is_enabled)
       VALUES (?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE
         secret_encrypted = VALUES(secret_encrypted),
         backup_codes_json = VALUES(backup_codes_json),
         is_enabled = 0,
         updated_at = NOW(3)`,
      [userId, secretEncrypted, backupCodesJson]
    );
  }

  async enableTwoFactor(userId: number): Promise<boolean> {
    const [res] = await pool.query<ResultSetHeader>(
      `UPDATE user_two_factor 
       SET is_enabled = 1, enabled_at = NOW(3) 
       WHERE user_id = ?`,
      [userId]
    );
    return res.affectedRows > 0;
  }

  async disableTwoFactor(userId: number): Promise<boolean> {
    const [res] = await pool.query<ResultSetHeader>(
      `UPDATE user_two_factor 
       SET is_enabled = 0 
       WHERE user_id = ?`,
      [userId]
    );
    return res.affectedRows > 0;
  }

  async consumeBackupCode(userId: number, codeHash: string): Promise<boolean> {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, backup_codes_json FROM user_two_factor WHERE user_id = ? AND is_enabled = 1 FOR UPDATE`,
        [userId]
      );
      if (rows.length === 0 || !rows[0].backup_codes_json) {
        await conn.rollback();
        return false;
      }

      let codes: { hash: string; used: boolean }[] = [];
      try {
        codes = typeof rows[0].backup_codes_json === 'string'
          ? JSON.parse(rows[0].backup_codes_json)
          : rows[0].backup_codes_json;
      } catch {
        codes = [];
      }

      const match = codes.find(c => c.hash === codeHash && !c.used);
      if (!match) {
        await conn.rollback();
        return false;
      }

      match.used = true;
      await conn.query(
        `UPDATE user_two_factor SET backup_codes_json = ? WHERE id = ?`,
        [JSON.stringify(codes), rows[0].id]
      );

      await conn.commit();
      return true;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // -------------------------------------------------------------------------
  // PACKAGE 6: SECURITY - LAST ACTIVE ADMIN & ROLE PERMISSIONS
  // -------------------------------------------------------------------------
  async isLastActiveAdmin(userId: number): Promise<boolean> {
    const [userRole] = await pool.query<RowDataPacket[]>(
      `SELECT ur.user_id FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = ? AND r.code = 'system_admin'`,
      [userId]
    );
    if (userRole.length === 0) {
      return false;
    }

    const [adminCount] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(DISTINCT u.id) as active_admin_count
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE r.code = 'system_admin' AND u.status = 'active'`
    );
    const count = Number(adminCount[0]?.active_admin_count || 0);
    return count <= 1;
  }

  async getRolePermissionsMatrix(): Promise<{
    roles: any[];
    permissions: any[];
    matrix: Record<number, number[]>;
  }> {
    const [roles] = await pool.query<RowDataPacket[]>(
      `SELECT id, code, name, description FROM roles ORDER BY id ASC`
    );

    const [permissions] = await pool.query<RowDataPacket[]>(
      `SELECT id, code, code as name, description, module as module_name FROM permissions ORDER BY module ASC, code ASC`
    );

    const [mappings] = await pool.query<RowDataPacket[]>(
      `SELECT role_id, permission_id FROM role_permissions`
    );

    const matrix: Record<number, number[]> = {};
    for (const r of roles) {
      matrix[r.id] = [];
    }
    for (const m of mappings) {
      if (!matrix[m.role_id]) {
        matrix[m.role_id] = [];
      }
      matrix[m.role_id].push(m.permission_id);
    }

    return { roles, permissions, matrix };
  }

  async updateRolePermissions(
    roleId: number,
    permissionIds: number[],
    adminUserId: number,
    adminUsername: string
  ): Promise<void> {
    const [roleRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, code, name FROM roles WHERE id = ? LIMIT 1`,
      [roleId]
    );
    if (roleRows.length === 0) {
      throw new AppError('Role not found.', 404, 'ROLE_NOT_FOUND');
    }

    const role = roleRows[0];
    if (role.code === 'system_admin') {
      throw new AppError('Permissions for the system_admin role are immutable and cannot be revoked.', 403, 'CANNOT_MODIFY_SYSTEM_ADMIN_PERMISSIONS');
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(`DELETE FROM role_permissions WHERE role_id = ?`, [roleId]);

      if (permissionIds.length > 0) {
        const values = permissionIds.map(pid => [roleId, pid]);
        await conn.query(
          `INSERT INTO role_permissions (role_id, permission_id) VALUES ?`,
          [values]
        );
      }

      await conn.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (NOW(3), ?, ?, 'ROLE_PERMISSIONS_UPDATE', 'roles', ?, 'success', ?, 'Role permission matrix updated')`,
        [
          adminUserId,
          adminUsername,
          String(roleId),
          JSON.stringify({ roleCode: role.code, permissionIds })
        ]
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async changePassword(userId: number, currentPass: string, newPass: string): Promise<boolean> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT password_hash FROM users WHERE id = ?`,
      [userId]
    );
    if (rows.length === 0) {
      throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    }

    const bcrypt = await import('bcrypt');
    const matches = await bcrypt.compare(currentPass, rows[0].password_hash);
    if (!matches) {
      throw new AppError('Current password is incorrect.', 400, 'INVALID_PASSWORD');
    }

    const newHash = await bcrypt.hash(newPass, 12);
    await pool.query(
      `UPDATE users SET password_hash = ?, password_changed_at = NOW(3), must_change_password = 0 WHERE id = ?`,
      [newHash, userId]
    );

    await pool.query(
      `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, reason)
       VALUES (NOW(3), ?, (SELECT username FROM users WHERE id = ?), 'PASSWORD_CHANGE', 'users', ?, 'success', 'User changed account password')`,
      [userId, userId, String(userId)]
    );

    return true;
  }

  async getNotifications(userId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, type, title, body, payload_json, read_at, created_at
       FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50`, [userId]
    );
    return rows.map((row) => ({
      ...row,
      payload_json: typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json
    }));
  }

  async markNotificationRead(userId: number, notificationId: number) {
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE notifications SET read_at = COALESCE(read_at, NOW(3)) WHERE id = ? AND user_id = ?`,
      [notificationId, userId]
    );
    if (!result.affectedRows) {
      const [rows] = await pool.query<RowDataPacket[]>(`SELECT id FROM notifications WHERE id = ? AND user_id = ? LIMIT 1`, [notificationId, userId]);
      if (!rows.length) throw new AppError('Notification was not found.', 404, 'NOTIFICATION_NOT_FOUND');
    }
    return true;
  }

  async markAllNotificationsRead(userId: number) {
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE notifications SET read_at = NOW(3) WHERE user_id = ? AND read_at IS NULL`, [userId]
    );
    return { updatedCount: result.affectedRows };
  }
}

