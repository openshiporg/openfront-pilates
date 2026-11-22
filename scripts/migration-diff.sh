#!/usr/bin/env bash
# Writes migrations/<timestamp>_<name>/migration.sql: the difference between the migration history
# and schema.prisma. Needs SHADOW_DATABASE_URL (an empty database Prisma may reset). Non-interactive.
set -euo pipefail
name="${1:?usage: scripts/migration-diff.sh <name>}"
: "${SHADOW_DATABASE_URL:?SHADOW_DATABASE_URL is required}"
dir="migrations/$(date -u +%Y%m%d%H%M%S)_${name}"
mkdir -p "$dir"
npx --no-install prisma migrate diff \
  --from-migrations migrations --shadow-database-url "$SHADOW_DATABASE_URL" \
  --to-schema-datamodel schema.prisma --script > "$dir/migration.sql"
if ! grep -q '[A-Za-z]' "$dir/migration.sql" || grep -q "This is an empty migration" "$dir/migration.sql"; then
  rm -rf "$dir"; echo "No schema changes."; exit 0
fi
echo "$dir"
