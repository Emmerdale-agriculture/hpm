#!/usr/bin/env bash
# Off-platform backup of hampshirepaddockmanagement.com → Backblaze B2.
#
#   b2:emmerdale/hpm/db/db-<ts>.dump.age   prod Postgres (pg_dump -Fc, age-encrypted)
#   b2:emmerdale/hpm/storage/<bucket>/     Supabase Storage media (incremental copy)
#   b2:emmerdale/hpm/site/repo.bundle      full git history (git bundle --all)
#
# Uses the `b2` remote in ~/.config/rclone/rclone.conf, DATABASE_URL_PROD from
# .env.local and SUPABASE_S3_* from .env.vercel. Only the age PUBLIC key lives
# here — the secret key stays offline and is only needed to restore:
#   age -d -i key.txt db-….dump.age | pg_restore -d <target>
#
# The bucket has Object Lock (30-day retention), so uploads are immutable.
set -euo pipefail

cd "$(dirname "$0")/.."
AGE_RECIPIENT="age13ffgw3laexljeugu6z0vf3ha4gtzsuth4yj5zp7tn8kw9hdkdfsqanp026"
DEST="b2:emmerdale/hpm"
RCLONE="${RCLONE:-$HOME/.local/bin/rclone}"
AGE="${AGE:-$HOME/.local/bin/age}"
TS="$(date -u +%Y-%m-%dT%H%MZ)"

getenv() { # file key — read one value without sourcing the whole file
  grep -E "^$2=" "$1" | head -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/'
}

DB_URL="$(getenv .env.local DATABASE_URL_PROD)"
export RCLONE_CONFIG_SB_TYPE=s3
export RCLONE_CONFIG_SB_PROVIDER=Other
export RCLONE_CONFIG_SB_ACCESS_KEY_ID="$(getenv .env.vercel SUPABASE_S3_ACCESS_KEY_ID)"
export RCLONE_CONFIG_SB_SECRET_ACCESS_KEY="$(getenv .env.vercel SUPABASE_S3_SECRET_ACCESS_KEY)"
export RCLONE_CONFIG_SB_ENDPOINT="$(getenv .env.vercel SUPABASE_S3_ENDPOINT)"
export RCLONE_CONFIG_SB_REGION="$(getenv .env.vercel SUPABASE_S3_REGION)"
export RCLONE_CONFIG_SB_FORCE_PATH_STYLE=true
MEDIA_BUCKET="$(getenv .env.vercel SUPABASE_S3_BUCKET)"

echo "[hpm-backup] 1/3 database → $DEST/db/db-$TS.dump.age"
pg_dump --format=custom --no-owner --no-privileges "$DB_URL" \
  | "$AGE" -r "$AGE_RECIPIENT" \
  | "$RCLONE" rcat "$DEST/db/db-$TS.dump.age"

echo "[hpm-backup] 2/3 media ($MEDIA_BUCKET) → $DEST/storage/$MEDIA_BUCKET/"
"$RCLONE" copy "sb:$MEDIA_BUCKET" "$DEST/storage/$MEDIA_BUCKET" \
  --size-only --transfers 8 --stats-one-line --stats 30s

echo "[hpm-backup] 3/3 git bundle → $DEST/site/repo.bundle"
BUNDLE="$(mktemp --suffix=.bundle)"
trap 'rm -f "$BUNDLE"' EXIT
git bundle create "$BUNDLE" --all
"$RCLONE" copyto "$BUNDLE" "$DEST/site/repo.bundle"

echo "[hpm-backup] done:"
"$RCLONE" size "$DEST"
