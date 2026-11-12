import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, KEY_LENGTH) as Buffer;
  return `scrypt$${salt}$${derived.toString('hex')}`;
};

export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const [scheme, salt, hex] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hex) return false;
  const derived = await scryptAsync(password, salt, KEY_LENGTH) as Buffer;
  const expected = Buffer.from(hex, 'hex');
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
};
