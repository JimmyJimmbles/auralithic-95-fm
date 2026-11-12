import { open } from 'node:fs/promises';

export type Sniffed = {
  kind: 'audio' | 'image';
  contentType: 'audio/mpeg' | 'audio/wav' | 'audio/flac' | 'audio/mp4' | 'image/jpeg' | 'image/png' | 'image/webp';
  extension: 'mp3' | 'wav' | 'flac' | 'm4a' | 'jpg' | 'png' | 'webp';
};

const aliases: Record<string, string> = {
  'audio/mp3': 'audio/mpeg',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/x-flac': 'audio/flac',
  'audio/m4a': 'audio/mp4',
  'audio/x-m4a': 'audio/mp4',
  'image/jpg': 'image/jpeg',
};

export const declaredTypeOk = (declared: string, sniffed: string): boolean => {
  const normalized = aliases[declared.toLowerCase()] ?? declared.toLowerCase();
  return normalized === 'application/octet-stream' || normalized === sniffed;
};

export const sniff = (bytes: Buffer): Sniffed | null => {
  if (bytes.length < 12) return null;
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { kind: 'image', contentType: 'image/png', extension: 'png' };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { kind: 'image', contentType: 'image/jpeg', extension: 'jpg' };
  }
  const riff = bytes.toString('ascii', 0, 4) === 'RIFF';
  const mark = bytes.toString('ascii', 8, 12);
  if (riff && mark === 'WEBP') return { kind: 'image', contentType: 'image/webp', extension: 'webp' };
  if (riff && mark === 'WAVE') return { kind: 'audio', contentType: 'audio/wav', extension: 'wav' };
  if (bytes.toString('ascii', 0, 4) === 'fLaC') return { kind: 'audio', contentType: 'audio/flac', extension: 'flac' };
  if (bytes.toString('ascii', 4, 8) === 'ftyp') return { kind: 'audio', contentType: 'audio/mp4', extension: 'm4a' };
  if (bytes.toString('ascii', 0, 3) === 'ID3') return { kind: 'audio', contentType: 'audio/mpeg', extension: 'mp3' };
  const second = bytes[1];
  if (bytes[0] === 0xff && second !== undefined && (second & 0xe0) === 0xe0) {
    return { kind: 'audio', contentType: 'audio/mpeg', extension: 'mp3' };
  }
  return null;
};

export const sniffFile = async (filePath: string): Promise<Sniffed | null> => {
  const handle = await open(filePath, 'r');
  try {
    const bytes = Buffer.alloc(16);
    const { bytesRead } = await handle.read(bytes, 0, 16, 0);
    return sniff(bytes.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
};
