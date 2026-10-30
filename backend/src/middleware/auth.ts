import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';
import { AuthUser } from '../types';
import { RowDataPacket } from 'mysql2';
import { getJwtSecret } from '../config/env';
import { createHash } from 'crypto';
import { AUTH_COOKIE_NAME } from '../modules/auth/auth.constants';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      requestId?: string;
    }
  }
}

export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader && authHeader.split(' ')[1];
  const cookie = req.headers.cookie?.split(';').map((item) => item.trim())
    .find((item) => item.startsWith(`${AUTH_COOKIE_NAME}=`));
  const cookieToken = cookie?.slice(AUTH_COOKIE_NAME.length + 1);
  const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
  const token = cookieToken || bearerToken || queryToken;

  if (!token) {
    res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Authentication token is required.'
      }
    });
    return;
  }

  const secret = getJwtSecret();

  try {
    const decoded = jwt.verify(token, secret) as { userId: number; username: string; sessionId?: string };

    if (decoded.sessionId) {
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const [sessionRows] = await pool.query<RowDataPacket[]>(
        `SELECT u.id, u.username, u.email FROM refresh_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.user_id = ? AND s.revoked_at IS NULL
           AND s.expires_at > NOW(3) AND u.status = 'active'
         LIMIT 1`,
        [tokenHash, decoded.userId]
      );
      if (sessionRows.length === 0) {
        res.status(401).json({
          error: { code: 'SESSION_EXPIRED', message: 'Your session has expired. Please sign in again.' }
        });
        return;
      }

      // Update session last_seen_at timestamp
      pool.query(
        `UPDATE refresh_sessions SET last_seen_at = NOW(3) WHERE token_hash = ? AND revoked_at IS NULL`,
        [tokenHash]
      ).catch(() => {});
    } else {
      res.status(401).json({
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired authentication token.' }
      });
      return;
    }

    // Fetch user and check active status
    const [userRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, username, email, status, must_change_password FROM users WHERE id = ?`,
      [decoded.userId]
    );

    if (userRows.length === 0 || userRows[0].status !== 'active') {
      res.status(401).json({
        error: {
          code: 'USER_INACTIVE_OR_NOT_FOUND',
          message: 'User account is inactive or no longer exists.'
        }
      });
      return;
    }

    const user = userRows[0];

    // Fetch roles
    const [roleRows] = await pool.query<RowDataPacket[]>(
      `SELECT r.code 
       FROM user_roles ur 
       JOIN roles r ON ur.role_id = r.id 
       WHERE ur.user_id = ?`,
      [user.id]
    );
    const roles = roleRows.map((r) => r.code);

    // Fetch permissions
    const [permRows] = await pool.query<RowDataPacket[]>(
      `SELECT DISTINCT p.code 
       FROM user_roles ur 
       JOIN role_permissions rp ON ur.role_id = rp.role_id 
       JOIN permissions p ON rp.permission_id = p.id 
       WHERE ur.user_id = ?`,
      [user.id]
    );
    const permissions = permRows.map((p) => p.code);

    // Fetch linked staff profile if applicable
    const [staffRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, first_name, father_name, staff_type, status 
       FROM staff 
       WHERE user_id = ?`,
      [user.id]
    );

    let staffId: number | undefined;
    let staffName: string | undefined;
    let staffType: string | undefined;

    if (staffRows.length > 0 && staffRows[0].status === 'active') {
      staffId = staffRows[0].id;
      staffName = `${staffRows[0].first_name} ${staffRows[0].father_name}`;
      staffType = staffRows[0].staff_type;
    }

    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      roles,
      permissions,
      staffId,
      staffName,
      staffType,
      mustChangePassword: Boolean(user.must_change_password)
    };

    const requestPath = req.originalUrl.split('?')[0];
    const passwordChangeAllowedPaths = ['/api/v1/auth/me', '/api/v1/auth/change-password', '/api/v1/auth/logout'];
    if (req.user.mustChangePassword && !passwordChangeAllowedPaths.includes(requestPath)) {
      res.status(403).json({
        error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password before using the application.' }
      });
      return;
    }

    // Check maintenance mode: only system_admin can access during maintenance
    const [maintRows] = await pool.query<RowDataPacket[]>(
      `SELECT value_json FROM system_settings WHERE setting_key = 'system.maintenance_mode'`
    );
    const inMaintenance = maintRows[0]?.value_json === 'true' || maintRows[0]?.value_json === true;
    if (inMaintenance && !roles.includes('system_admin')) {
      res.status(503).json({
        error: {
          code: 'SYSTEM_IN_MAINTENANCE',
          message: 'The system is currently undergoing scheduled maintenance. Please check back shortly.'
        }
      });
      return;
    }

    next();
  } catch (err) {
    res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired authentication token.'
      }
    });
  }
};
