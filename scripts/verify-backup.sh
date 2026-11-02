#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source_file="${1:?Uso: bash scripts/verify-backup.sh backups/archivo.dump}"
test -f "$source_file"
test_database="kairos_restore_check_$(date -u +%s)_${RANDOM}"
[[ "$test_database" =~ ^kairos_restore_check_[0-9]+_[0-9]+$ ]]
docker compose exec -T db sh -c 'createdb -U "$POSTGRES_USER" "$1"' sh "$test_database"
cleanup() { docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" "$1"' sh "$test_database"; }
trap cleanup EXIT
docker compose exec -T db sh -c 'pg_restore --exit-on-error --no-owner --no-privileges -U "$POSTGRES_USER" -d "$1"' sh "$test_database" < "$source_file"
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1" -c "SELECT count(*) AS registros FROM records; SELECT count(*) AS eventos FROM audit; SELECT count(*) AS usuarios FROM users;"' sh "$test_database"
printf 'Restauración temporal completada. Comparar los conteos con el origen para validar la copia.\n'
