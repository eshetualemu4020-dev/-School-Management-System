import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { z } from 'zod';
import { env } from '../../config/env';
import { AUTH_COOKIE_NAME } from './auth.constants';

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username or email is required.').max(190),
  password: z.string().min(1, 'Password is required.').max(128),
  rememberMe: z.boolean().optional(),
  role: z.enum(['student', 'guardian', 'parent', 'teacher', 'registrar', 'librarian', 'administrator']).optional()
});

const registerSchema = z.object({
  role: z.enum(['student', 'guardian', 'teacher', 'registrar', 'librarian', 'administrator']),
  firstName: z.string().min(1, 'First name is required.'),
  lastName: z.string().min(1, 'Last name is required.'),
  email: z.string().email('Please enter a valid email address.'),
  phone: z.string().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters long.'),
  idNumber: z.string().optional()
});

const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'Email is required.').email('Please enter a valid email address.')
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required.'),
  password: z.string().min(8, 'Password must be at least 8 characters long.')
});

export class AuthController {
  private authService = new AuthService();

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid registration data.',
            details: parsed.error.issues.map((issue) => ({
              field: issue.path.join('.'),
              message: issue.message
            }))
          }
        });
        return;
      }

      const result = await this.authService.register(parsed.data, {
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null,
        requestId: req.requestId || null
      });
      if (result.token) {
        this.setSessionCookie(res, result.token, false);
      }
      const { token: _token, ...safeResult } = result;
      res.status(201).json({ data: safeResult });
    } catch (err) {
      next(err);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body.',
            details: parsed.error.issues.map((issue) => ({
              field: issue.path.join('.'),
              message: issue.message
            }))
          }
        });
        return;
      }

      const result = await this.authService.login(parsed.data.username, parsed.data.password, {
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null,
        requestId: req.requestId || null,
        rememberMe: parsed.data.rememberMe
      });

      // The sign-in form offers a role selector, but the authoritative role is the
      // one stored against the account in the database. A correct password must
      // never be rejected because a dropdown was left on the wrong option, so a
      // mismatch is reported as a warning and the account's real role still wins.
      let roleWarning: string | null = null;
      if (parsed.data.role && !result.mfaRequired) {
        const accountRoles: string[] = (result.user as any)?.roles || [];
        const expected = parsed.data.role === 'parent' ? 'guardian' : parsed.data.role;
        const hasRole = accountRoles.some(
          (r) => r === expected || (expected === 'guardian' && r === 'parent')
        );
        if (accountRoles.length > 0 && !hasRole) {
          roleWarning = `Signed in with the role on your account (${accountRoles.join(', ')}) rather than the selected role.`;
        }
      }

      if (result.token) {
        this.setSessionCookie(res, result.token, Boolean(parsed.data.rememberMe));
      }
      const { token: _token, ...safeResult } = result;
      res.status(200).json({
        data: roleWarning ? { ...safeResult, roleWarning } : safeResult
      });
    } catch (err) {
      next(err);
    }
  };

  forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = forgotPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid email address.',
            details: parsed.error.issues.map((issue) => ({
              field: issue.path.join('.'),
              message: issue.message
            }))
          }
        });
        return;
      }

      const result = await this.authService.forgotPassword(parsed.data.email, req.ip || null);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = resetPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid password reset request.',
            details: parsed.error.issues.map((issue) => ({
              field: issue.path.join('.'),
              message: issue.message
            }))
          }
        });
        return;
      }

      const result = await this.authService.resetPassword(parsed.data.token, parsed.data.password);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  me = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json({ data: req.user });
  };

  getNotifications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json({ data: await this.authService.getNotifications(req.user!.id) });
    } catch (err) {
      next(err);
    }
  };

  markNotificationRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const notificationId = Number(req.params.id);
      const result = await this.authService.markNotificationRead(req.user!.id, notificationId);
      res.status(200).json({ data: { success: result } });
    } catch (err) {
      next(err);
    }
  };

  markAllNotificationsRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json({ data: await this.authService.markAllNotificationsRead(req.user!.id) });
    } catch (err) {
      next(err);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const cookie = req.headers.cookie?.split(';').map((item) => item.trim())
        .find((item) => item.startsWith(`${AUTH_COOKIE_NAME}=`));
      const cookieToken = cookie?.slice(AUTH_COOKIE_NAME.length + 1) || null;
      const authorization = req.headers.authorization?.split(' ')[1] || null;
      await this.authService.logout(cookieToken || authorization);
      res.clearCookie(AUTH_COOKIE_NAME, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
      });
      res.status(200).json({ data: { message: 'Signed out.' } });
    } catch (err) {
      next(err);
    }
  };

  setup2FA = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.authService.setup2FA(req.user!.id);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  verify2FA = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { code } = req.body;
      if (!code || typeof code !== 'string') {
        res.status(400).json({ error: { code: 'INVALID_CODE', message: 'Verification code is required.' } });
        return;
      }
      const result = await this.authService.verifyAndEnable2FA(req.user!.id, code);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  disable2FA = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { password } = req.body;
      if (!password || typeof password !== 'string') {
        res.status(400).json({ error: { code: 'PASSWORD_REQUIRED', message: 'Current password is required to disable 2FA.' } });
        return;
      }
      const result = await this.authService.disable2FA(req.user!.id, password);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  authenticate2FA = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tempToken, code, rememberMe } = req.body;
      if (!tempToken || !code) {
        res.status(400).json({ error: { code: 'INVALID_PARAMS', message: 'Temporary token and authentication code are required.' } });
        return;
      }
      const result = await this.authService.authenticate2FA(tempToken, code, {
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null,
        requestId: req.requestId || null,
        rememberMe: Boolean(rememberMe)
      });
      if (result.token) {
        this.setSessionCookie(res, result.token, Boolean(rememberMe));
      }
      const { token: _token, ...safeResult } = result;
      res.status(200).json({ data: safeResult });
    } catch (err) {
      next(err);
    }
  };

  changePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        res.status(400).json({ error: { code: 'PASSWORD_REQUIRED', message: 'Current and new password are required.' } });
        return;
      }
      const result = await this.authService.changePassword(req.user!.id, currentPassword, newPassword);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  private setSessionCookie(res: Response, token: string, rememberMe: boolean): void {
    res.cookie(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000
    });
  }
}
