CREATE TABLE "release_artists" (
	"release_slug" text NOT NULL,
	"artist_slug" text NOT NULL,
	"sort" integer NOT NULL,
	CONSTRAINT "release_artists_pkey" PRIMARY KEY("release_slug","artist_slug")
);
--> statement-breakpoint
ALTER TABLE "release_artists" ADD CONSTRAINT "release_artists_release_slug_releases_slug_fk" FOREIGN KEY ("release_slug") REFERENCES "public"."releases"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_artists" ADD CONSTRAINT "release_artists_artist_slug_artists_slug_fk" FOREIGN KEY ("artist_slug") REFERENCES "public"."artists"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "release_artists_sort_unique" ON "release_artists" USING btree ("release_slug","sort");--> statement-breakpoint
CREATE INDEX "release_artists_artist_idx" ON "release_artists" USING btree ("artist_slug");--> statement-breakpoint
INSERT INTO "release_artists" ("release_slug", "artist_slug", "sort")
SELECT "slug", "artist_slug", 0 FROM "releases";
