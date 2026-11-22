#!/usr/bin/env bash
# npm test: the offline suite, then the database state-machine suite (tests/db) against
# TEST_DATABASE_URL. The database tests are skipped, with a message, when it is unset.
# TEST_DATABASE_URL must point at a database you can migrate; it is brought up to date first.
set -uo pipefail
status=0
node --import tsx --test tests/*.test.ts || status=1
if [ -n "${TEST_DATABASE_URL:-}" ]; then
  DATABASE_URL="$TEST_DATABASE_URL" npx --no-install prisma migrate deploy > /dev/null || { echo "migrate deploy failed"; exit 1; }
else
  echo "TEST_DATABASE_URL is not set: the database tests (tests/db) are skipped."
fi
node --import tsx --test --test-concurrency=1 --test-timeout=600000 tests/db/*.db.test.ts || status=1
exit $status
