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
      `SELECT id, username, email, password_hash, status, locked_until
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
         VALUES (?, ?, ?, ?, ?, 1)`,
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
             WHEN failed_login_count >= 5 THEN DATE_ADD(NOW(3), INTERVAL 15 MINUTE)
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
}
