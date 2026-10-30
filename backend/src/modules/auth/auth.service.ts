import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../../config/database';
import { AuthRepository, PublicRegistrationInput } from './auth.repository';
import { AppError } from '../../middleware/errorHandler';
import { env, getJwtSecret } from '../../config/env';
import { isEmailDeliveryConfigured, sendPasswordResetEmail } from './auth.mailer';
import {
  validatePasswordPolicy,
  generateTotpSecret,
  generateTotpUri,
  verifyTotp,
  generateBackupCodes,
  hashBackupCode
} from './security.utils';

export interface SessionContext {
  ipAddress: string | null;
  userAgent: string | null;
  requestId?: string | null;
  rememberMe?: boolean;
}

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export class AuthService {
  private authRepo = new AuthRepository();

  async forgotPassword(email: string, requestedIp: string | null = null) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new AppError('Email is required.', 400, 'INVALID_EMAIL');
    }

    const deliveryConfigured = isEmailDeliveryConfigured() && env.NODE_ENV !== 'test';
    if (!deliveryConfigured) {
      return {
        deliveryConfigured: false,
        message: 'Password recovery is unavailable because email delivery is not configured.'
      };
    }

    const user = await this.authRepo.findByIdentifier(normalizedEmail);
    if (user?.status === 'active') {
      const resetToken = randomBytes(32).toString('base64url');
      const tokenHash = hashToken(resetToken);
      await this.authRepo.createPasswordResetToken(user.id, tokenHash, requestedIp);
      try {
        await sendPasswordResetEmail(user.email, resetToken);
      } catch (error) {
        await this.authRepo.deletePasswordResetToken(tokenHash);
        console.error('Password reset email delivery failed.');
      }
    }

    return {
      deliveryConfigured,
      message: 'If an eligible account exists for this address and delivery succeeds, password reset instructions will be sent.'
    };
  }

  async resetPassword(token: string, plainPassword: string) {
    const policyCheck = validatePasswordPolicy(plainPassword);
    if (!policyCheck.valid) {
      throw new AppError(policyCheck.error || 'Password does not meet complexity requirements.', 400, 'INVALID_PASSWORD_POLICY');
    }

    const passwordHash = await bcrypt.hash(plainPassword, 12);
    await this.authRepo.consumePasswordResetToken(hashToken(token), passwordHash);

    return {
      message: 'Password reset successful. Please sign in with your new password.'
    };
  }

  async register(
    publicData: PublicRegistrationInput,
    context: SessionContext = { ipAddress: null, userAgent: null }
  ) {
    // Staff roles do not require admin approval; accounts activate immediately.
    const requiresApproval = false;

    if (!publicData.firstName?.trim() || !publicData.lastName?.trim()) {
      throw new AppError('First name and last name are required.', 400, 'INVALID_NAME');
    }

    if (!publicData.email?.trim()) {
      throw new AppError('Email is required.', 400, 'INVALID_EMAIL');
    }

    const policyCheck = validatePasswordPolicy(publicData.password);
    if (!policyCheck.valid) {
      throw new AppError(policyCheck.error || 'Password does not meet complexity requirements.', 400, 'INVALID_PASSWORD_POLICY');
    }

    const email = publicData.email.trim().toLowerCase();
    const existing = await this.authRepo.findByIdentifier(email);
    if (existing) {
      throw new AppError('An account with this email already exists.', 409, 'DUPLICATE_EMAIL');
    }

    const passwordHash = await bcrypt.hash(publicData.password, 12);
    const created = await this.authRepo.createPublicAccount({
      ...publicData,
      email,
      passwordHash,
      accountStatus: requiresApproval ? 'invited' : 'active'
    });

    // Fetch roles, permissions and staff profile for the newly created user
    const roles = await this.authRepo.getUserRoles(created.id);
    const permissions = await this.authRepo.getUserPermissions(created.id);
    const staff = await this.authRepo.getStaffProfile(created.id);

    const token = requiresApproval ? null : await this.createSession(created.id, created.username, context);
    if (requiresApproval) {
      await this.authRepo.recordAuthenticationEvent(created.id, created.username, 'auth.registration_pending', 'success', context.ipAddress, context.userAgent, context.requestId ?? null);
    } else {
      await this.authRepo.updateLastLogin(created.id);
      await this.authRepo.recordAuthenticationEvent(created.id, created.username, 'auth.registration_succeeded', 'success', context.ipAddress, context.userAgent, context.requestId ?? null);
    }

    return {
      token,
      pendingApproval: requiresApproval,
      user: {
        id: created.id,
        username: created.username,
        email: created.email,
        roles,
        permissions,
        staff: staff
          ? {
              id: staff.id,
              employeeNo: staff.employee_no,
              fullName: `${staff.first_name} ${staff.father_name}`,
              staffType: staff.staff_type,
              department: staff.department,
              jobTitle: staff.job_title
            }
          : null
      }
    };
  }

  async login(
    identifier: string,
    plainPass: string,
    context: SessionContext = { ipAddress: null, userAgent: null }
  ) {
    const user = await this.authRepo.findByIdentifier(identifier);
    if (!user) {
      await this.authRepo.recordLoginAttempt(null, identifier, context.ipAddress, context.userAgent, false, 'user_not_found');
      await this.authRepo.recordAuthenticationEvent(null, identifier, 'auth.login_failed', 'failure', context.ipAddress, context.userAgent, context.requestId ?? null);
      throw new AppError('Invalid username/email or password.', 401, 'INVALID_CREDENTIALS');
    }

    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      await this.authRepo.recordLoginAttempt(user.id, user.username, context.ipAddress, context.userAgent, false, 'account_locked');
      await this.authRepo.recordAuthenticationEvent(user.id, user.username, 'auth.login_locked', 'denied', context.ipAddress, context.userAgent, context.requestId ?? null);
      throw new AppError('Sign-in is temporarily locked. Please try again later.', 423, 'ACCOUNT_TEMPORARILY_LOCKED');
    }

    if (user.status === 'invited') {
      await pool.query('UPDATE users SET status = "active" WHERE id = ?', [user.id]);
      user.status = 'active';
    }

    if (user.status !== 'active') {
      await this.authRepo.recordLoginAttempt(user.id, user.username, context.ipAddress, context.userAgent, false, 'account_inactive');
      await this.authRepo.recordAuthenticationEvent(user.id, user.username, 'auth.login_inactive', 'denied', context.ipAddress, context.userAgent, context.requestId ?? null);
      throw new AppError('This account is disabled. Contact the school administrator for help.', 403, 'ACCOUNT_INACTIVE');
    }

    const matches = await bcrypt.compare(plainPass, user.password_hash);
    if (!matches) {
      await this.authRepo.recordFailedLogin(user.id);
      await this.authRepo.recordLoginAttempt(user.id, user.username, context.ipAddress, context.userAgent, false, 'invalid_password');
      await this.authRepo.recordAuthenticationEvent(user.id, user.username, 'auth.login_failed', 'failure', context.ipAddress, context.userAgent, context.requestId ?? null);
      throw new AppError('Invalid username/email or password.', 401, 'INVALID_CREDENTIALS');
    }

    // Check if user has Two-Factor Authentication enabled
    const twoFactor = await this.authRepo.getUserTwoFactor(user.id);
    if (twoFactor && twoFactor.is_enabled) {
      const tempToken = jwt.sign(
        { userId: user.id, username: user.username, purpose: 'mfa_pending' },
        getJwtSecret(),
        { expiresIn: 300 }
      );
      await this.authRepo.recordLoginAttempt(user.id, user.username, context.ipAddress, context.userAgent, true, 'mfa_challenge_issued');
      return {
        token: null,
        mfaRequired: true,
        tempToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        }
      };
    }

    const roles = await this.authRepo.getUserRoles(user.id);
    const permissions = await this.authRepo.getUserPermissions(user.id);
    const staff = await this.authRepo.getStaffProfile(user.id);

    await this.authRepo.updateLastLogin(user.id);
    await this.authRepo.recordLoginAttempt(user.id, user.username, context.ipAddress, context.userAgent, true, null);

    const token = await this.createSession(user.id, user.username, context);
    await this.authRepo.recordAuthenticationEvent(user.id, user.username, 'auth.login_succeeded', 'success', context.ipAddress, context.userAgent, context.requestId ?? null);

    const mustChangePassword = Boolean(user.must_change_password);

    return {
      token,
      mfaRequired: false,
      mustChangePassword,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        mustChangePassword,
        roles,
        permissions,
        staff: staff
          ? {
              id: staff.id,
              employeeNo: staff.employee_no,
              fullName: `${staff.first_name} ${staff.father_name}`,
              staffType: staff.staff_type,
              department: staff.department,
              jobTitle: staff.job_title
            }
          : null
      }
    };
  }

  async setup2FA(userId: number) {
    const [userRows] = await pool.query<RowDataPacket[]>(`SELECT email FROM users WHERE id = ?`, [userId]);
    const userEmail = userRows[0]?.email || `user_${userId}@school.local`;

    const secret = generateTotpSecret();
    const otpauthUri = generateTotpUri(secret, userEmail, 'Ketema Nigus ERP');
    const backupCodes = generateBackupCodes(8);
    const hashedCodes = backupCodes.map((code: string) => ({ hash: hashBackupCode(code), used: false }));

    await this.authRepo.saveTwoFactorSetup(userId, secret, JSON.stringify(hashedCodes));

    return {
      secret,
      otpauthUri,
      backupCodes
    };
  }

  async verifyAndEnable2FA(userId: number, code: string) {
    const twoFactor = await this.authRepo.getUserTwoFactor(userId);
    if (!twoFactor) {
      throw new AppError('Two-factor setup has not been initiated.', 400, '2FA_NOT_INITIALIZED');
    }

    const isValid = verifyTotp(twoFactor.secret_encrypted, code.trim());
    if (!isValid) {
      throw new AppError('Invalid two-factor authentication code. Ensure your authenticator app is synced.', 400, 'INVALID_2FA_CODE');
    }

    await this.authRepo.enableTwoFactor(userId);
    await this.authRepo.recordAuthenticationEvent(userId, String(userId), 'auth.2fa_enabled', 'success', null, null, null);

    return { success: true, message: 'Two-factor authentication enabled successfully.' };
  }

  async disable2FA(userId: number, currentPassword: string) {
    const [userRows] = await pool.query<RowDataPacket[]>(`SELECT password_hash FROM users WHERE id = ?`, [userId]);
    if (userRows.length === 0) {
      throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    }

    const matches = await bcrypt.compare(currentPassword, userRows[0].password_hash);
    if (!matches) {
      throw new AppError('Current password incorrect.', 400, 'INVALID_PASSWORD');
    }

    await this.authRepo.disableTwoFactor(userId);
    await this.authRepo.recordAuthenticationEvent(userId, String(userId), 'auth.2fa_disabled', 'success', null, null, null);

    return { success: true, message: 'Two-factor authentication disabled.' };
  }

  async authenticate2FA(
    tempToken: string,
    code: string,
    context: SessionContext = { ipAddress: null, userAgent: null }
  ) {
    let decoded: any;
    try {
      decoded = jwt.verify(tempToken, getJwtSecret());
    } catch {
      throw new AppError('Invalid or expired MFA session. Please sign in again.', 401, 'INVALID_MFA_SESSION');
    }

    if (decoded.purpose !== 'mfa_pending' || !decoded.userId) {
      throw new AppError('Invalid MFA session token.', 401, 'INVALID_MFA_SESSION');
    }

    const userId = decoded.userId;
    const twoFactor = await this.authRepo.getUserTwoFactor(userId);
    if (!twoFactor || !twoFactor.is_enabled) {
      throw new AppError('Two-factor authentication is not active for this account.', 400, '2FA_NOT_ACTIVE');
    }

    const cleanedCode = code.trim().replace(/\s+/g, '');
    let passed = false;

    // Check TOTP code (6 digits)
    if (/^\d{6}$/.test(cleanedCode)) {
      passed = verifyTotp(twoFactor.secret_encrypted, cleanedCode);
    }

    // If TOTP failed, check if it's a backup code (8-10 alphanumeric characters)
    if (!passed) {
      const codeHash = hashBackupCode(cleanedCode);
      passed = await this.authRepo.consumeBackupCode(userId, codeHash);
    }

    if (!passed) {
      await this.authRepo.recordLoginAttempt(userId, decoded.username, context.ipAddress, context.userAgent, false, 'invalid_mfa_code');
      throw new AppError('Invalid authentication code or recovery code.', 401, 'INVALID_MFA_CODE');
    }

    // Success! Update login and issue session
    const [userRows] = await pool.query<RowDataPacket[]>(`SELECT id, username, email, must_change_password FROM users WHERE id = ?`, [userId]);
    const user = userRows[0];
    const roles = await this.authRepo.getUserRoles(userId);
    const permissions = await this.authRepo.getUserPermissions(userId);
    const staff = await this.authRepo.getStaffProfile(userId);

    await this.authRepo.updateLastLogin(userId);
    await this.authRepo.recordLoginAttempt(userId, user.username, context.ipAddress, context.userAgent, true, 'mfa_success');
    const token = await this.createSession(userId, user.username, context);
    await this.authRepo.recordAuthenticationEvent(userId, user.username, 'auth.login_succeeded', 'success', context.ipAddress, context.userAgent, context.requestId ?? null);

    const mustChangePassword = Boolean(user.must_change_password);

    return {
      token,
      mustChangePassword,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        mustChangePassword,
        roles,
        permissions,
        staff: staff
          ? {
              id: staff.id,
              employeeNo: staff.employee_no,
              fullName: `${staff.first_name} ${staff.father_name}`,
              staffType: staff.staff_type,
              department: staff.department,
              jobTitle: staff.job_title
            }
          : null
      }
    };
  }

  async changePassword(userId: number, currentPass: string, newPass: string) {
    if (!currentPass || !newPass) {
      throw new AppError('Current and new password are required.', 400, 'PASSWORD_REQUIRED');
    }
    const policy = validatePasswordPolicy(newPass);
    if (!policy.valid) {
      throw new AppError(policy.error || 'Password does not meet complexity requirements.', 400, 'INVALID_PASSWORD_POLICY');
    }
    return this.authRepo.changePassword(userId, currentPass, newPass);
  }

  async getNotifications(userId: number) {
    return this.authRepo.getNotifications(userId);
  }

  async markNotificationRead(userId: number, notificationId: number) {
    if (!Number.isSafeInteger(notificationId) || notificationId <= 0) throw new AppError('A valid notification is required.', 400, 'INVALID_NOTIFICATION_ID');
    return this.authRepo.markNotificationRead(userId, notificationId);
  }

  async markAllNotificationsRead(userId: number) {
    return this.authRepo.markAllNotificationsRead(userId);
  }

  async logout(token: string | null): Promise<void> {
    if (token) {
      await this.authRepo.revokeSession(hashToken(token));
    }
  }

  private async createSession(userId: number, username: string, context: SessionContext): Promise<string> {
    const expiresInSeconds = context.rememberMe ? 30 * 24 * 60 * 60 : 8 * 60 * 60;
    const sessionId = randomUUID();
    const token = jwt.sign({ userId, username, sessionId }, getJwtSecret(), { expiresIn: expiresInSeconds });
    await this.authRepo.createSession(
      userId,
      hashToken(token),
      new Date(Date.now() + expiresInSeconds * 1000),
      context.ipAddress,
      context.userAgent?.slice(0, 255) ?? null
    );
    return token;
  }
}

