import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, realpath, rename, rm, stat, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { config } from '../config.js';
import { contentTypeForKey, encodeKey, isSafeKey, resolveInside } from './path.js';

export type OpenedObject = {
  filePath: string;
  size: number;
  contentType: string;
};

export type MediaStore = {
  publicUrl: (key: string) => string;
  put: (key: string, filePath: string, contentType: string) => Promise<void>;
  putMaster: (key: string, filePath: string, contentType: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
  removeMaster: (key: string) => Promise<void>;
  exists: (key: string) => Promise<boolean>;
  open: (key: string) => Promise<OpenedObject | null>;
};

const isEnoent = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 'ENOENT';

const locateForRead = async (root: string, key: string): Promise<string | null> => {
  if (!isSafeKey(key)) return null;
  let rootReal: string;
  try {
    rootReal = await realpath(root);
  } catch {
    return null;
  }
  const dest = resolveInside(rootReal, key);
  if (!dest) return null;
  let fileReal: string;
  try {
    fileReal = await realpath(dest);
  } catch {
    return null;
  }
  if (!fileReal.startsWith(`${rootReal}${path.sep}`)) return null;
  return fileReal;
};

const locateForWrite = async (root: string, key: string): Promise<string> => {
  if (!isSafeKey(key)) throw new Error('Invalid media key');
  const rootReal = await realpath(root);
  const dest = resolveInside(rootReal, key);
  if (!dest) throw new Error('Invalid media key');
  await mkdir(path.dirname(dest), { recursive: true });
  const parentReal = await realpath(path.dirname(dest));
  if (parentReal !== rootReal && !parentReal.startsWith(`${rootReal}${path.sep}`)) {
    throw new Error('Invalid media key');
  }
  const finalPath = path.join(parentReal, path.basename(dest));
  try {
    const current = await lstat(finalPath);
    if (current.isSymbolicLink()) await unlink(finalPath);
  } catch (error) {
    if (!isEnoent(error)) throw error;
  }
  return finalPath;
};

const writeAtomic = async (root: string, key: string, source: string) => {
  const dest = await locateForWrite(root, key);
  const temporary = `${dest}.${randomUUID()}.tmp`;
  try {
    await copyFile(source, temporary);
    await rename(temporary, dest);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
};

const createDiskStore = (root: string, masterRoot: string): MediaStore => ({
  publicUrl: (key) => {
    if (!isSafeKey(key)) throw new Error('Invalid media key');
    return `/media/${encodeKey(key)}`;
  },
  put: (key, filePath) => writeAtomic(root, key, filePath),
  putMaster: (key, filePath) => writeAtomic(masterRoot, key, filePath),
  remove: async (key) => {
    const filePath = await locateForRead(root, key);
    if (filePath) await rm(filePath, { force: true });
  },
  removeMaster: async (key) => {
    const filePath = await locateForRead(masterRoot, key);
    if (filePath) await rm(filePath, { force: true });
  },
  exists: async (key) => {
    const filePath = await locateForRead(root, key);
    if (!filePath) return false;
    const info = await stat(filePath);
    return info.isFile();
  },
  open: async (key) => {
    const contentType = contentTypeForKey(key);
    const filePath = await locateForRead(root, key);
    if (!contentType || !filePath) return null;
    const info = await stat(filePath);
    if (!info.isFile()) return null;
    return { filePath, size: info.size, contentType };
  },
});

const createR2Store = async (
  r2: Extract<typeof config.media, { driver: 'r2' }>,
): Promise<MediaStore> => {
  const { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey },
  });
  const missing = (error: unknown) => {
    if (typeof error !== 'object' || error === null) return false;
    const name = 'name' in error ? (error as { name: unknown }).name : undefined;
    if (name === 'NotFound' || name === 'NoSuchKey') return true;
    const metadata = '$metadata' in error ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata : undefined;
    return metadata?.httpStatusCode === 404;
  };
  const putAt = async (key: string, filePath: string, contentType: string) => {
    if (!isSafeKey(key)) throw new Error('Invalid media key');
    const info = await stat(filePath);
    await client.send(new PutObjectCommand({
      Bucket: r2.bucket,
      Key: key,
      Body: createReadStream(filePath),
      ContentType: contentType,
      ContentLength: info.size,
    }));
  };
  const removeAt = async (key: string) => {
    if (!isSafeKey(key)) return;
    await client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: key }));
  };
  return {
    publicUrl: (key) => {
      if (!isSafeKey(key)) throw new Error('Invalid media key');
      return `${r2.publicBaseUrl}/${encodeKey(key)}`;
    },
    put: putAt,
    putMaster: (key, filePath, contentType) => putAt(`masters/${key}`, filePath, contentType),
    remove: removeAt,
    removeMaster: (key) => removeAt(`masters/${key}`),
    exists: async (key) => {
      if (!isSafeKey(key)) return false;
      try {
        await client.send(new HeadObjectCommand({ Bucket: r2.bucket, Key: key }));
        return true;
      } catch (error) {
        if (missing(error)) return false;
        throw error;
      }
    },
    open: async () => null,
  };
};

let current: MediaStore | undefined;

export const initMedia = async (): Promise<void> => {
  if (config.media.driver === 'disk') {
    await mkdir(config.media.masterRoot, { recursive: true });
    const root = await stat(config.media.root);
    if (!root.isDirectory()) throw new Error(`MEDIA_ROOT is not a directory: ${config.media.root}`);
    current = createDiskStore(config.media.root, config.media.masterRoot);
    return;
  }
  current = await createR2Store(config.media);
};

export const media = (): MediaStore => {
  if (!current) throw new Error('Media store is not initialized');
  return current;
};
