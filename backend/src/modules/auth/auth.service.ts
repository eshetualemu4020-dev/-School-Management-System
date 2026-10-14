import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { AuthRepository, PublicRegistrationInput } from './auth.repository';
import { AppError } from '../../middleware/errorHandler';
import { env, getJwtSecret } from '../../config/env';
import { isEmailDeliveryConfigured, sendPasswordResetEmail } from './auth.mailer';

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
    if (!plainPassword || plainPassword.length < 6) {
      throw new AppError('Password must be at least 6 characters long.', 400, 'INVALID_PASSWORD_LENGTH');
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
    const requiresApproval = false;

    if (!publicData.firstName?.trim() || !publicData.lastName?.trim()) {
      throw new AppError('First name and last name are required.', 400, 'INVALID_NAME');
    }

    if (!publicData.email?.trim()) {
      throw new AppError('Email is required.', 400, 'INVALID_EMAIL');
    }

    if (!publicData.password || publicData.password.length < 6) {
      throw new AppError('Password must be at least 6 characters long.', 400, 'INVALID_PASSWORD_LENGTH');
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
      await this.authRepo.recordAuthenticationEvent(null, identifier, 'auth.login_failed', 'failure', context.ipAddress, context.userAgent, context.requestId ?? null);
      throw new AppError('Invalid username/email or password.', 401, 'INVALID_CREDENTIALS');
    }

    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      await this.authRepo.recordAuthenticationEvent(user.id, user.username, 'auth.login_locked', 'denied', context.ipAddress, context.userAgent, context.requestId ?? null);
      throw new AppError('Sign-in is temporarily locked. Please try again later.', 423, 'ACCOUNT_TEMPORARILY_LOCKED');
    }

    if (user.status === 'invited') {
      await this.authRepo.activateUser(user.id);
      user.status = 'active';
    }

    if (user.status !== 'active') {
      await this.authRepo.recordAuthenticationEvent(user.id, user.username, 'auth.login_inactive', 'denied', context.ipAddress, context.userAgent, context.requestId ?? null);
      throw new AppError('This account is disabled. Contact the school administrator for help.', 403, 'ACCOUNT_INACTIVE');
    }

    const matches = await bcrypt.compare(plainPass, user.password_hash);
    if (!matches) {
      await this.authRepo.recordFailedLogin(user.id);
      await this.authRepo.recordAuthenticationEvent(user.id, user.username, 'auth.login_failed', 'failure', context.ipAddress, context.userAgent, context.requestId ?? null);
      throw new AppError('Invalid username/email or password.', 401, 'INVALID_CREDENTIALS');
    }

    const roles = await this.authRepo.getUserRoles(user.id);
    const permissions = await this.authRepo.getUserPermissions(user.id);
    const staff = await this.authRepo.getStaffProfile(user.id);

    await this.authRepo.updateLastLogin(user.id);

    const token = await this.createSession(user.id, user.username, context);
    await this.authRepo.recordAuthenticationEvent(user.id, user.username, 'auth.login_succeeded', 'success', context.ipAddress, context.userAgent, context.requestId ?? null);

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
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
