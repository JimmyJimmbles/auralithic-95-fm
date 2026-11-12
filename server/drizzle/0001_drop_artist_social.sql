INSERT INTO artist_links (artist_slug, label, url, sort)
SELECT a.slug, a.social_label, a.social_url, 0
FROM artists AS a
WHERE a.social_label <> ''
  AND a.social_url <> ''
  AND NOT EXISTS (
    SELECT 1 FROM artist_links AS link
    WHERE link.artist_slug = a.slug
      AND lower(link.label) = lower(a.social_label)
  );
--> statement-breakpoint
UPDATE artist_links AS link
SET sort = link.sort + 1
FROM artists AS a
WHERE link.artist_slug = a.slug
  AND lower(link.label) <> lower(a.social_label)
  AND a.social_label <> '';
--> statement-breakpoint
ALTER TABLE artists DROP COLUMN social_label;
--> statement-breakpoint
ALTER TABLE artists DROP COLUMN social_url;
