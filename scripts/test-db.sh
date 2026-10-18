#!/usr/bin/env bash
# Database tests: applies supabase/migrations to a throwaway Postgres in
# Docker and runs the SQL checks in supabase/tests/.
#
#   1. Template DB: Supabase stub + every migration applied TWICE (proves the
#      migrations are idempotent, since we re-run them by hand on the live project)
#   2. Each supabase/tests/*.test.sql runs in its own fresh copy of the template
#   3. Each supabase/tests/upgrade/NNNN_*.seed.sql runs against migrations
#      before NNNN, then the rest are applied and NNNN_*.check.sql runs
#      (proves a migration upgrades existing data correctly)
#
# Usage: npm run test:db      (needs Docker)
set -euo pipefail
cd "$(dirname "$0")/.."
export MSYS_NO_PATHCONV=1   # Git Bash on Windows: don't rewrite paths for docker

IMAGE="${POSTGRES_IMAGE:-postgres:17}"
CONTAINER="routeops-db-test-$$"
STUB=supabase/tests/stubs/supabase_stub.sql

docker run -d --rm --name "$CONTAINER" -e POSTGRES_PASSWORD=test "$IMAGE" >/dev/null
trap 'docker stop "$CONTAINER" >/dev/null 2>&1 || true' EXIT

# The image restarts Postgres once after initdb, so wait for two successes
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" psql -U postgres -tAc 'select 1' >/dev/null 2>&1; then
    sleep 1
    docker exec "$CONTAINER" psql -U postgres -tAc 'select 1' >/dev/null 2>&1 && break
  fi
  sleep 1
done

sql() { docker exec -i "$CONTAINER" psql -U postgres -X -q -v ON_ERROR_STOP=1 "$@"; }
# Migration output is mostly "already exists, skipping" notices from the
# second pass, so it's only shown when a migration fails
apply() {
  local out
  if ! out=$(sql -d "$1" < "$2" 2>&1); then
    echo "Migration failed: $2"; echo "$out" | grep -E 'ERROR' ; exit 1
  fi
}

failed=0
run_check() { # db, file, label
  local out
  if out=$(sql -d "$1" < "$2" 2>&1); then
    echo "$out" | sed -n 's/.*NOTICE:  PASS: /  ✓ /p'
  else
    echo "$out" | sed -n 's/.*NOTICE:  PASS: /  ✓ /p'
    echo "$out" | grep -E 'ERROR|FAIL' | sed 's/^/  ✗ /'
    failed=1
  fi
}

migrations=(supabase/migrations/*.sql)

echo "Building template: stub + ${#migrations[@]} migrations x2"
sql -c 'CREATE DATABASE template_migrated' >/dev/null
apply template_migrated "$STUB"
for pass in 1 2; do
  for m in "${migrations[@]}"; do apply template_migrated "$m"; done
done

n=0
for t in supabase/tests/*.test.sql; do
  n=$((n + 1)); db="t$n"
  echo "$(basename "$t")"
  sql -c "CREATE DATABASE $db TEMPLATE template_migrated" >/dev/null
  run_check "$db" "$t"
done

for seed in supabase/tests/upgrade/*.seed.sql; do
  [ -e "$seed" ] || continue
  name=$(basename "$seed" .seed.sql); version=${name%%_*}
  n=$((n + 1)); db="u$n"
  echo "upgrade/$name"
  sql -c "CREATE DATABASE $db" >/dev/null
  apply "$db" "$STUB"
  for m in "${migrations[@]}"; do [[ $(basename "$m") < "$version" ]] && apply "$db" "$m"; done
  apply "$db" "$seed"
  for pass in 1 2; do
    for m in "${migrations[@]}"; do [[ $(basename "$m") < "$version" ]] || apply "$db" "$m"; done
  done
  run_check "$db" "supabase/tests/upgrade/$name.check.sql"
done

if [ "$failed" -ne 0 ]; then echo "Database tests FAILED"; exit 1; fi
echo "Database tests passed"
