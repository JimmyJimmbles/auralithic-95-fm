import { createReadStream } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { hasAdminSession } from '../auth/admin.js';
import { httpError } from '../http/error.js';
import { emptyBody, mediaParams, read, strictEmpty } from '../http/validate.js';
import { isPublishedKey } from '../media/upload.js';
import { isSafeKey } from '../media/path.js';
import { media } from '../media/store.js';

const readRange = (header: string | string[] | undefined, size: number) => {
  if (header === undefined) return { start: 0, end: size - 1, partial: false };
  if (Array.isArray(header)) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size <= 0) return null;
  const startText = match[1] ?? '';
  const endText = match[2] ?? '';
  if (startText === '' && endText === '') return null;
  if (startText === '') {
    const suffix = Number(endText);
    if (!Number.isInteger(suffix) || suffix <= 0) return null;
    return { start: Math.max(size - suffix, 0), end: size - 1, partial: true };
  }
  const start = Number(startText);
  if (!Number.isInteger(start) || start < 0 || start >= size) return null;
  const end = endText === '' ? size - 1 : Number(endText);
  if (!Number.isInteger(end) || end < start) return null;
  return { start, end: Math.min(end, size - 1), partial: true };
};

export const mediaRoutes = async (app: FastifyInstance) => {
  app.get('/media/*', async (request, reply) => {
    const { params } = read(request, mediaParams, strictEmpty, emptyBody);
    const key = params['*'];
    if (!isSafeKey(key)) throw httpError(400, 'Invalid media path');
    const allowed = await isPublishedKey(key) || await hasAdminSession(request);
    if (!allowed) return reply.code(404).send({ error: 'Not found' });
    const opened = await media().open(key);
    if (!opened || opened.size <= 0) return reply.code(404).send({ error: 'Not found' });
    const range = readRange(request.headers.range, opened.size);
    if (!range) {
      return reply
        .code(416)
        .header('Accept-Ranges', 'bytes')
        .header('Content-Range', `bytes */${opened.size}`)
        .send();
    }
    const length = range.end - range.start + 1;
    const response = reply
      .code(range.partial ? 206 : 200)
      .header('Content-Type', opened.contentType)
      .header('Accept-Ranges', 'bytes')
      .header('Content-Length', length)
      .header('Cache-Control', 'public, max-age=3600');
    if (range.partial) response.header('Content-Range', `bytes ${range.start}-${range.end}/${opened.size}`);
    return response.send(createReadStream(opened.filePath, { start: range.start, end: range.end }));
  });
};
