ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "oxylabs_username" text NOT NULL DEFAULT '';
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "oxylabs_password" text NOT NULL DEFAULT '';
