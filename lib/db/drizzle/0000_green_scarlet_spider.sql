-- Drop orphaned Google OAuth columns from the settings table.
-- These columns are no longer referenced by any application code.
ALTER TABLE "settings" DROP COLUMN IF EXISTS "google_email";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "google_access_token";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "google_refresh_token";--> statement-breakpoint
ALTER TABLE "settings" DROP COLUMN IF EXISTS "google_token_expiry";
