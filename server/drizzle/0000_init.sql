CREATE TYPE "public"."publish_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."release_type" AS ENUM('single', 'album');--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artist_links" (
	"artist_slug" text NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"sort" integer NOT NULL,
	CONSTRAINT "artist_links_pkey" PRIMARY KEY("artist_slug","label")
);
--> statement-breakpoint
CREATE TABLE "artists" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"channel" text NOT NULL,
	"style" text NOT NULL,
	"bio" text NOT NULL,
	"portrait_key" text,
	"social_label" text NOT NULL,
	"social_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listeners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "playbacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listener_id" uuid,
	"track_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"qualified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"slug" text PRIMARY KEY NOT NULL,
	"artist_slug" text NOT NULL,
	"title" text NOT NULL,
	"type" "release_type" NOT NULL,
	"release_date" date NOT NULL,
	"cover_key" text,
	"status" "publish_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "track_likes" (
	"listener_id" uuid NOT NULL,
	"track_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "track_likes_pkey" PRIMARY KEY("listener_id","track_id")
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" text PRIMARY KEY NOT NULL,
	"release_slug" text NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"duration_seconds" integer NOT NULL,
	"audio_key" text,
	"master_key" text,
	"status" "publish_status" DEFAULT 'draft' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artist_links" ADD CONSTRAINT "artist_links_artist_slug_artists_slug_fk" FOREIGN KEY ("artist_slug") REFERENCES "public"."artists"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbacks" ADD CONSTRAINT "playbacks_listener_id_listeners_id_fk" FOREIGN KEY ("listener_id") REFERENCES "public"."listeners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbacks" ADD CONSTRAINT "playbacks_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_artist_slug_artists_slug_fk" FOREIGN KEY ("artist_slug") REFERENCES "public"."artists"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_likes" ADD CONSTRAINT "track_likes_listener_id_listeners_id_fk" FOREIGN KEY ("listener_id") REFERENCES "public"."listeners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_likes" ADD CONSTRAINT "track_likes_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_release_slug_releases_slug_fk" FOREIGN KEY ("release_slug") REFERENCES "public"."releases"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "artists_channel_unique" ON "artists" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "artists_portrait_key_idx" ON "artists" USING btree ("portrait_key");--> statement-breakpoint
CREATE INDEX "login_codes_email_idx" ON "login_codes" USING btree ("email");--> statement-breakpoint
CREATE INDEX "playbacks_track_qualified_idx" ON "playbacks" USING btree ("track_id","qualified_at");--> statement-breakpoint
CREATE INDEX "releases_artist_idx" ON "releases" USING btree ("artist_slug");--> statement-breakpoint
CREATE INDEX "releases_cover_key_idx" ON "releases" USING btree ("cover_key");--> statement-breakpoint
CREATE INDEX "track_likes_track_idx" ON "track_likes" USING btree ("track_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tracks_release_position_unique" ON "tracks" USING btree ("release_slug","position");--> statement-breakpoint
CREATE INDEX "tracks_release_idx" ON "tracks" USING btree ("release_slug");--> statement-breakpoint
CREATE INDEX "tracks_audio_key_idx" ON "tracks" USING btree ("audio_key");