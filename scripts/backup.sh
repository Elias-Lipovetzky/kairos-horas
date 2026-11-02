#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p backups
target="backups/kairos-$(date -u +%Y%m%dT%H%M%SZ).dump"
temporary="${target}.partial"
trap 'rm -f -- "$temporary"' EXIT
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$temporary"
test -s "$temporary"
mv -- "$temporary" "$target"
printf 'Copia creada: %s\n' "$target"
