import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { z } from 'zod';
import { env } from '../../config/env';
import { AUTH_COOKIE_NAME } from './auth.constants';

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username or email is required.').max(190),
  password: z.string().min(1, 'Password is required.').max(128),
  rememberMe: z.boolean().optional()
});

const registerSchema = z.object({
  role: z.enum(['student', 'guardian', 'teacher', 'registrar', 'librarian', 'administrator']),
  firstName: z.string().min(1, 'First name is required.'),
  lastName: z.string().min(1, 'Last name is required.'),
  email: z.string().email('Please enter a valid email address.'),
  phone: z.string().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters long.'),
  idNumber: z.string().optional()
});

const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'Email is required.').email('Please enter a valid email address.')
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required.'),
  password: z.string().min(6, 'Password must be at least 6 characters long.')
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
      this.setSessionCookie(res, result.token, Boolean(parsed.data.rememberMe));
      const { token: _token, ...safeResult } = result;
      res.status(200).json({ data: safeResult });
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
