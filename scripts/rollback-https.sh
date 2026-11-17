#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
python3 "$root/scripts/tls-state.py" rollback "${1:?Pass the backup directory printed during setup}"
echo 'Previous proxy/application configuration restored. Database data was not modified.'
