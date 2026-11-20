-- HPM Cheatcode — backlink targets + GA4 — production schema migration
--
-- Apply BEFORE deploying the commit that adds the `link_target` opportunity
-- type, the `analytics` field and the `cheatcode-settings` global
-- (Payload doesn't push schema in production; without these the cron's
-- writes and the admin's Cheatcode settings page would fail).
--
--   Supabase SQL Editor → New query → paste → Run
--   or: ! psql "$DATABASE_URL_PROD" -f docs/cheatcode-links-ga4-prod-migration.sql
--
-- Additive only: 1 enum value, 1 nullable column, 1 new table seeded with
-- the current agency DA band (30–40). No existing data is touched.
-- Idempotent: safe to re-run.
--
-- Generated from Payload's own dev-mode push against the local mirror
-- (pg_dump -s diff), so names/types match what Payload expects.

BEGIN;

-- 1. New opportunity type ---------------------------------------------------
ALTER TYPE "public"."enum_seo_opportunities_type" ADD VALUE IF NOT EXISTS 'link_target';

-- 2. GA4 snapshot per opportunity -------------------------------------------
ALTER TABLE "public"."seo_opportunities" ADD COLUMN IF NOT EXISTS "analytics" jsonb;

-- 3. Cheatcode settings global ----------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."cheatcode_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "da_min" numeric DEFAULT 30,
  "da_max" numeric DEFAULT 40,
  "links_per_month" numeric DEFAULT 10,
  "max_link_pages" numeric DEFAULT 3,
  "updated_at" timestamp(3) with time zone,
  "created_at" timestamp(3) with time zone
);

INSERT INTO "public"."cheatcode_settings" ("da_min", "da_max", "links_per_month", "max_link_pages", "updated_at", "created_at")
SELECT 30, 40, 10, 3, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "public"."cheatcode_settings");

COMMIT;
