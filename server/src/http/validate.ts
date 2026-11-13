import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { httpError } from './error.js';

export const strictEmpty = z.object({}).strict();

export const emptyBody = z.preprocess(
  (value) => (value === undefined || value === null ? {} : value),
  strictEmpty,
);

const slug = z.string().trim().min(1).max(63).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens');

export const httpsUrl = z.string().trim().max(2000).superRefine((value, ctx) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Link must be an https URL' });
    return;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hostname.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Link must be an https URL' });
  }
});

const linkSchema = z.object({
  label: z.string().trim().min(1).max(80),
  url: httpsUrl,
}).strict();

const linksSchema = z.array(linkSchema).max(20).superRefine((links, ctx) => {
  const seen = new Set<string>();
  for (const link of links) {
    const key = link.label.toLowerCase();
    if (seen.has(key)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Link labels must be unique' });
      return;
    }
    seen.add(key);
  }
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((value) => {
  const parts = value.split('-').map((part) => Number(part));
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || !month || !day) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, 'Invalid date');

export const slugParams = z.object({ slug }).strict();
export const trackParams = z.object({ trackId: slug }).strict();
export const trackIdParams = z.object({ id: slug }).strict();
export const playbackParams = z.object({ id: z.string().uuid() }).strict();
export const mediaParams = z.object({ '*': z.string().min(1).max(512) }).strict();

export const likeBody = z.object({ liked: z.boolean() }).strict();
export const playBody = z.object({ trackId: slug }).strict();
export const loginBody = z.object({ email: z.string().trim().email().max(320) }).strict();
export const passwordBody = z.object({
  password: z.string().min(12).max(200),
}).strict();
export const verifyBody = z.object({
  email: z.string().trim().email().max(320),
  code: z.string().trim().regex(/^\d{6}$/, 'Code must be 6 digits'),
}).strict();

export const artistBody = z.object({
  slug,
  name: z.string().trim().min(1).max(120),
  channel: z.string().trim().regex(/^\d{2}$/, 'Channel must be two digits'),
  style: z.string().trim().min(1).max(160),
  bio: z.string().trim().min(1).max(4000),
  links: linksSchema,
}).strict();

export const artistPatch = artistBody.omit({ slug: true });

const artistSlugs = z.array(slug).min(1).max(3).superRefine((list, ctx) => {
  if (new Set(list).size !== list.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose each artist once' });
  }
});

export const releaseBody = z.object({
  slug,
  artistSlugs,
  title: z.string().trim().min(1).max(200),
  type: z.enum(['single', 'album']),
  releaseDate: isoDate,
}).strict();

export const releasePatch = releaseBody.omit({ slug: true });

export const trackBody = z.object({
  id: slug,
  releaseSlug: slug,
  title: z.string().trim().min(1).max(200),
  durationSeconds: z.number().int().positive().max(60 * 60 * 4),
}).strict();

export const trackPatch = z.object({
  title: z.string().trim().min(1).max(200),
  durationSeconds: z.number().int().positive().max(60 * 60 * 4),
}).strict();

export const reorderBody = z.object({
  releaseSlug: slug,
  trackIds: z.array(slug).min(1).max(500),
}).strict();

export const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) {
    const message = result.error.issues.map((issue) => {
      const issuePath = issue.path.join('.');
      return issuePath ? `${issuePath}: ${issue.message}` : issue.message;
    }).join('; ');
    throw httpError(400, message || 'Invalid request');
  }
  return result.data;
};

export const read = <P, Q, B>(
  request: FastifyRequest,
  params: z.ZodType<P>,
  query: z.ZodType<Q>,
  body: z.ZodType<B>,
) => ({
  params: parse(params, request.params),
  query: parse(query, request.query),
  body: parse(body, request.body),
});
