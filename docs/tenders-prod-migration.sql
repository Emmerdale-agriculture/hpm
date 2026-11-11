-- HPM Tenders — production schema migration
--
-- Apply BEFORE deploying the commit that adds src/payload/collections/tenders.ts
-- (Payload doesn't push schema in production; without these objects the
-- admin's locked-documents query and the /api/tender-watch cron would fail).
--
--   Supabase SQL Editor → New query → paste → Run
--   or: ! psql "$DATABASE_URL_PROD" -f docs/tenders-prod-migration.sql
--
-- Additive only: 4 new enums, 1 new table + indexes, 1 new nullable column
-- on payload_locked_documents_rels. No existing data is touched.
-- Idempotent: safe to re-run.
--
-- Generated from Payload's own dev-mode push against the local mirror
-- (pg_dump -s diff), so names/types match what Payload expects.

BEGIN;

-- 1. Enums -----------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "public"."enum_tenders_kind" AS ENUM ('open', 'pipeline', 'renewal', 'lead');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."enum_tenders_status" AS ENUM
    ('new', 'watching', 'reviewing', 'bidding', 'submitted', 'won', 'lost', 'no_bid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."enum_tenders_fit" AS ENUM ('rural', 'grounds', 'subcontract', 'unsure');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."enum_tenders_source" AS ENUM ('contracts_finder', 'find_a_tender', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Table -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "tenders" (
  "id"              serial PRIMARY KEY NOT NULL,
  "title"           varchar NOT NULL,
  "buyer"           varchar,
  "kind"            "enum_tenders_kind" DEFAULT 'open' NOT NULL,
  "status"          "enum_tenders_status" DEFAULT 'new' NOT NULL,
  "fit"             "enum_tenders_fit",
  "action_by"       timestamp(3) with time zone,
  "deadline"        timestamp(3) with time zone,
  "contract_start"  timestamp(3) with time zone,
  "contract_end"    timestamp(3) with time zone,
  "value_low"       numeric,
  "value_high"      numeric,
  "incumbent"       varchar,
  "url"             varchar,
  "description"     varchar,
  "notes"           varchar,
  "source"          "enum_tenders_source" DEFAULT 'manual',
  "source_key"      varchar,
  "postcode"        varchar,
  "distance_miles"  numeric,
  "cpv"             varchar,
  "matched"         varchar,
  "score"           numeric,
  "published_at"    timestamp(3) with time zone,
  "last_seen_at"    timestamp(3) with time zone,
  "updated_at"      timestamp(3) with time zone DEFAULT now() NOT NULL,
  "created_at"      timestamp(3) with time zone DEFAULT now() NOT NULL
);

CREATE INDEX        IF NOT EXISTS "tenders_buyer_idx"      ON "tenders" USING btree ("buyer");
CREATE INDEX        IF NOT EXISTS "tenders_status_idx"     ON "tenders" USING btree ("status");
CREATE INDEX        IF NOT EXISTS "tenders_action_by_idx"  ON "tenders" USING btree ("action_by");
CREATE UNIQUE INDEX IF NOT EXISTS "tenders_source_key_idx" ON "tenders" USING btree ("source_key");
CREATE INDEX        IF NOT EXISTS "tenders_updated_at_idx" ON "tenders" USING btree ("updated_at");
CREATE INDEX        IF NOT EXISTS "tenders_created_at_idx" ON "tenders" USING btree ("created_at");

-- Bid notes are private. Payload connects as the table owner (bypasses RLS);
-- this just stops Supabase's anon/authenticated REST roles reading the table.
ALTER TABLE "tenders" ENABLE ROW LEVEL SECURITY;

-- 3. Payload document-locking join table ------------------------------------

ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "tenders_id" integer;

CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_tenders_id_idx"
  ON "payload_locked_documents_rels" USING btree ("tenders_id");

DO $$ BEGIN
  ALTER TABLE "payload_locked_documents_rels"
    ADD CONSTRAINT "payload_locked_documents_rels_tenders_fk"
    FOREIGN KEY ("tenders_id") REFERENCES "public"."tenders"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;

-- Verify:
--   SELECT count(*) FROM tenders;                                   -- 0 before first run
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'payload_locked_documents_rels' AND column_name = 'tenders_id';
