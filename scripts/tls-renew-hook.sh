#!/usr/bin/env bash
set -euo pipefail

# Certbot invokes this only after successful renewal. Other certificates are unaffected.
if [[ "${RENEWED_LINEAGE:-}" != /etc/letsencrypt/live/kairoshoras.com ]]; then
    exit 0
fi
root=${1:?Project directory required}
project=${2:?Compose project required}
cd "$root"
docker compose --project-directory "$root" -p "$project" exec -T proxy nginx -t
docker compose --project-directory "$root" -p "$project" exec -T proxy nginx -s reload
