CREATE TABLE "live_schedules" (
  "scope" text PRIMARY KEY NOT NULL,
  "seed" text NOT NULL,
  "cycle" integer DEFAULT 0 NOT NULL,
  "epoch" timestamp with time zone NOT NULL,
  "tracks" jsonb NOT NULL,
  "pending" jsonb,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
