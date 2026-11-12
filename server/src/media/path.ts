import path from 'node:path';

const SAFE_KEY = /^[a-zA-Z0-9._/-]+$/;

export const isSafeKey = (key: string): boolean => {
  if (key.length === 0 || key.length > 512 || !SAFE_KEY.test(key)) return false;
  return key.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
};

export const resolveInside = (root: string, key: string): string | null => {
  if (!isSafeKey(key)) return null;
  const rootResolved = path.resolve(root);
  const full = path.resolve(rootResolved, ...key.split('/'));
  if (!full.startsWith(`${rootResolved}${path.sep}`)) return null;
  return full;
};

const CONTENT_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export const contentTypeForKey = (key: string): string | null => {
  const extension = key.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPES[extension] ?? null;
};

export const encodeKey = (key: string): string =>
  key.split('/').map((segment) => encodeURIComponent(segment)).join('/');
