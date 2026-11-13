import { date, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const releaseType = pgEnum('release_type', ['single', 'album']);
export const publishStatus = pgEnum('publish_status', ['draft', 'published']);

const createdAt = () => timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();

export const artists = pgTable('artists', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  channel: text('channel').notNull(),
  style: text('style').notNull(),
  bio: text('bio').notNull(),
  portraitKey: text('portrait_key'),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('artists_channel_unique').on(table.channel),
  index('artists_portrait_key_idx').on(table.portraitKey),
]);

export const artistLinks = pgTable('artist_links', {
  artistSlug: text('artist_slug').notNull().references(() => artists.slug, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  url: text('url').notNull(),
  sort: integer('sort').notNull(),
}, (table) => [
  primaryKey({ name: 'artist_links_pkey', columns: [table.artistSlug, table.label] }),
]);

export const releases = pgTable('releases', {
  slug: text('slug').primaryKey(),
  artistSlug: text('artist_slug').notNull().references(() => artists.slug),
  title: text('title').notNull(),
  type: releaseType('type').notNull(),
  releaseDate: date('release_date').notNull(),
  coverKey: text('cover_key'),
  status: publishStatus('status').notNull().default('draft'),
  publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
}, (table) => [
  index('releases_artist_idx').on(table.artistSlug),
  index('releases_cover_key_idx').on(table.coverKey),
]);

export const releaseArtists = pgTable('release_artists', {
  releaseSlug: text('release_slug').notNull().references(() => releases.slug, { onDelete: 'cascade' }),
  artistSlug: text('artist_slug').notNull().references(() => artists.slug, { onDelete: 'cascade' }),
  sort: integer('sort').notNull(),
}, (table) => [
  primaryKey({ name: 'release_artists_pkey', columns: [table.releaseSlug, table.artistSlug] }),
  uniqueIndex('release_artists_sort_unique').on(table.releaseSlug, table.sort),
  index('release_artists_artist_idx').on(table.artistSlug),
]);

export const tracks = pgTable('tracks', {
  id: text('id').primaryKey(),
  releaseSlug: text('release_slug').notNull().references(() => releases.slug, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  position: integer('position').notNull(),
  durationSeconds: integer('duration_seconds').notNull(),
  audioKey: text('audio_key'),
  masterKey: text('master_key'),
  status: publishStatus('status').notNull().default('draft'),
}, (table) => [
  uniqueIndex('tracks_release_position_unique').on(table.releaseSlug, table.position),
  index('tracks_release_idx').on(table.releaseSlug),
  index('tracks_audio_key_idx').on(table.audioKey),
]);

export const listeners = pgTable('listeners', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: createdAt(),
});

export const trackLikes = pgTable('track_likes', {
  listenerId: uuid('listener_id').notNull().references(() => listeners.id, { onDelete: 'cascade' }),
  trackId: text('track_id').notNull().references(() => tracks.id),
  createdAt: createdAt(),
}, (table) => [
  primaryKey({ name: 'track_likes_pkey', columns: [table.listenerId, table.trackId] }),
  index('track_likes_track_idx').on(table.trackId),
]);

export const playbacks = pgTable('playbacks', {
  id: uuid('id').primaryKey().defaultRandom(),
  listenerId: uuid('listener_id').references(() => listeners.id, { onDelete: 'set null' }),
  trackId: text('track_id').notNull().references(() => tracks.id),
  startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  qualifiedAt: timestamp('qualified_at', { withTimezone: true, mode: 'date' }),
}, (table) => [
  index('playbacks_track_qualified_idx').on(table.trackId, table.qualifiedAt),
]);

export const loginCodes = pgTable('login_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
}, (table) => [
  index('login_codes_email_idx').on(table.email),
]);

export const adminSessions = pgTable('admin_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
});

export const adminCredentials = pgTable('admin_credentials', {
  id: text('id').primaryKey().default('owner'),
  passwordHash: text('password_hash').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type LiveCut = {
  id: string;
  durationMs: number;
  group: string;
};

export const liveSchedules = pgTable('live_schedules', {
  scope: text('scope').primaryKey(),
  seed: text('seed').notNull(),
  cycle: integer('cycle').notNull().default(0),
  epoch: timestamp('epoch', { withTimezone: true, mode: 'date' }).notNull(),
  tracks: jsonb('tracks').$type<LiveCut[]>().notNull(),
  pending: jsonb('pending').$type<LiveCut[] | null>(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type ArtistRow = typeof artists.$inferSelect;
export type ReleaseRow = typeof releases.$inferSelect;
export type TrackRow = typeof tracks.$inferSelect;
