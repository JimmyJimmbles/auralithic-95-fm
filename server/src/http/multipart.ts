import '@fastify/multipart';
import type { FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { httpError } from './error.js';

const tmpRoot = path.resolve(process.cwd(), 'var/tmp');

export const receiveFile = async (request: FastifyRequest, limit: number) => {
  const part = await request.file({ limits: { fileSize: limit, files: 1 } });
  if (!part) throw httpError(400, 'File is required');
  await mkdir(tmpRoot, { recursive: true });
  const filePath = path.join(tmpRoot, randomUUID());
  try {
    await pipeline(part.file, createWriteStream(filePath));
  } catch (error) {
    await rm(filePath, { force: true });
    throw error;
  }
  if (part.file.truncated) {
    await rm(filePath, { force: true });
    throw httpError(413, 'File is too large');
  }
  const info = await stat(filePath);
  if (info.size === 0 || info.size > limit) {
    await rm(filePath, { force: true });
    throw httpError(info.size === 0 ? 400 : 413, info.size === 0 ? 'File is empty' : 'File is too large');
  }
  return {
    filePath,
    declaredType: part.mimetype,
    cleanup: async () => {
      await rm(filePath, { force: true });
    },
  };
};
