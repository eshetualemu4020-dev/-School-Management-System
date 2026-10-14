import nodemailer from 'nodemailer';
import { env } from '../../config/env';

export const isEmailDeliveryConfigured = (): boolean => Boolean(
  env.SMTP_HOST && env.SMTP_FROM
);

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  if (!isEmailDeliveryConfigured()) {
    throw new Error('Password recovery email is not configured.');
  }

  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined
  });
  const resetUrl = new URL('/', env.FRONTEND_URL);
  resetUrl.searchParams.set('resetToken', token);

  await transport.sendMail({
    from: env.SMTP_FROM,
    to: email,
    subject: 'Reset your HSPSMS password',
    text: `Use this single-use link within 15 minutes to reset your password: ${resetUrl.toString()}`,
    html: `<p>Use this single-use link within 15 minutes to reset your password:</p><p><a href="${resetUrl.toString()}">Reset password</a></p>`
  });
}