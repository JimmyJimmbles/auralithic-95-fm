import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

export const generateCode = (): string => randomInt(0, 1_000_000).toString().padStart(6, '0');

export const hashCode = (code: string): string =>
  createHmac('sha256', config.sessionSecret).update(code).digest('hex');

export const codesMatch = (code: string, hash: string): boolean => {
  const actual = Buffer.from(hashCode(code), 'hex');
  const expected = Buffer.from(hash, 'hex');
  if (actual.length === 0 || actual.length !== expected.length) {
    timingSafeEqual(actual, Buffer.alloc(actual.length));
    return false;
  }
  return timingSafeEqual(actual, expected);
};
