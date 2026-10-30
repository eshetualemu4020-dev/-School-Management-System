import { createHmac, randomBytes, createHash } from 'crypto';

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbol: false
};

export function validatePasswordPolicy(
  password: string,
  policy: Partial<PasswordPolicy> = {}
): { valid: boolean; error?: string } {
  const p = { ...DEFAULT_PASSWORD_POLICY, ...policy };

  if (!password || password.length < p.minLength) {
    return {
      valid: false,
      error: `Password must be at least ${p.minLength} characters long.`
    };
  }

  if (p.requireUppercase && !/[A-Z]/.test(password)) {
    return {
      valid: false,
      error: 'Password must contain at least one uppercase letter (A-Z).'
    };
  }

  if (p.requireLowercase && !/[a-z]/.test(password)) {
    return {
      valid: false,
      error: 'Password must contain at least one lowercase letter (a-z).'
    };
  }

  if (p.requireNumber && !/[0-9]/.test(password)) {
    return {
      valid: false,
      error: 'Password must contain at least one number (0-9).'
    };
  }

  if (p.requireSymbol && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    return {
      valid: false,
      error: 'Password must contain at least one special character / symbol.'
    };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Base32 & RFC 6238 TOTP Engine (Standard HMAC-SHA1)
// ---------------------------------------------------------------------------
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(encoded: string): Buffer {
  const cleanInput = encoded.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleanInput.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleanInput[i]);
    if (idx === -1) continue;

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generateTotpCode(secretBase32: string, counter: number): string {
  const key = base32Decode(secretBase32);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));

  const hmac = createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

export function verifyTotpToken(
  secretBase32: string,
  token: string,
  window = 1,
  timeStep = 30
): boolean {
  if (!token || token.length !== 6 || !/^\d{6}$/.test(token)) {
    return false;
  }

  const currentCounter = Math.floor(Date.now() / 1000 / timeStep);

  for (let i = -window; i <= window; i++) {
    const expected = generateTotpCode(secretBase32, currentCounter + i);
    if (expected === token) {
      return true;
    }
  }

  return false;
}

export const verifyTotp = verifyTotpToken;

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function generateTotpUri(
  secret: string,
  username: string,
  issuer = 'Ketema Nigus ERP'
): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedUser = encodeURIComponent(username);
  return `otpauth://totp/${encodedIssuer}:${encodedUser}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

export function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(4).toString('hex').toUpperCase();
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
  }
  return codes;
}

export function generateTotpSetup(
  username: string,
  issuer = 'Ketema Nigus ERP'
): { secret: string; otpauthUrl: string; backupCodes: string[] } {
  const secret = generateTotpSecret();
  const otpauthUrl = generateTotpUri(secret, username, issuer);
  const backupCodes = generateBackupCodes(8);

  return { secret, otpauthUrl, backupCodes };
}

export function hashBackupCode(code: string): string {
  const normalized = code.replace(/[-\s]/g, '').toUpperCase();
  return createHash('sha256').update(normalized).digest('hex');
}

