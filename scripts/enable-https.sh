#!/usr/bin/env bash
# Run on Debian as root after pulling the committed repository changes.
set -Eeuo pipefail
umask 077

[[ $EUID -eq 0 ]] || { echo 'Run: sudo bash scripts/enable-https.sh account-email' >&2; exit 1; }
email=${1:?Pass the email for the Let\'s Encrypt account}
[[ "$email" == *@*.* ]] || { echo 'Invalid email.' >&2; exit 1; }
shift
project_hint=()
if (($#)); then
    [[ $# -eq 2 && "$1" == --project && "$2" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || {
        echo 'Usage: sudo bash scripts/enable-https.sh EMAIL [--project EXISTING_PROJECT]' >&2
        exit 1
    }
    project_hint=("$2")
fi
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"
domain=kairoshoras.com
origin=149.28.101.92
helper="$root/scripts/tls-state.py"
[[ -f .env ]] || { echo 'Existing .env not found; no credentials will be generated.' >&2; exit 1; }
exec 9>/run/lock/kairos-https.lock
flock -n 9 || { echo 'Another HTTPS deployment is running.' >&2; exit 1; }

packages=()
for dependency in python3 certbot curl openssl; do
    command -v "$dependency" >/dev/null || packages+=("$dependency")
done
command -v dig >/dev/null || packages+=(dnsutils)
if ((${#packages[@]})); then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${packages[@]}" ca-certificates
fi
python3 - "$(docker compose version --short)" <<'PY'
import re, sys
version = tuple(map(int, re.search(r'(\d+)\.(\d+)\.(\d+)', sys.argv[1]).groups()))
if version < (2, 24, 4):
    sys.exit('Docker Compose >=2.24.4 is required for replacement of published ports.')
PY

echo 'Checking public DNS. Temporarily use DNS only (grey cloud) during issuance.'
for resolver in 1.1.1.1 8.8.8.8; do
    records=$(dig +short +time=3 +tries=1 "@$resolver" A "$domain" | sort -u)
    [[ "$records" == "$origin" ]] || {
        echo "DNS at $resolver must return only $origin, currently: $records" >&2
        echo 'Set Cloudflare A @ to the VPS, DNS only. Wait for propagation, then retry.' >&2
        exit 1
    }
    [[ -z "$(dig +short +time=3 +tries=1 "@$resolver" AAAA "$domain")" ]] || {
        echo 'Remove the direct AAAA record for bootstrap; this setup targets the provided IPv4.' >&2
        exit 1
    }
done
dig +short NS "$domain"
dig +short CAA "$domain"

backup="/var/backups/kairos/https-$(date -u +%Y%m%dT%H%M%SZ)-$$"
install -d -m 700 "$backup"
project=$(python3 "$helper" snapshot "$root" "$backup" "${project_hint[@]}")
volume=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["volume"])' "$backup/state.json")
echo "Existing project: $project; existing database volume: $volume"
echo "Rollback: sudo bash scripts/rollback-https.sh $backup"

changed=false
rollback_on_error() {
    result=$?
    trap - ERR
    if [[ "$changed" == true ]]; then
        echo 'HTTPS setup failed. Restoring previous proxy and app configuration.' >&2
        if ! python3 "$helper" rollback "$backup"; then
            echo "Automatic rollback failed. Keep $backup and use rollback-https.sh." >&2
        fi
    fi
    exit "$result"
}
trap rollback_on_error ERR

# Do not enable/reset the host firewall. If UFW is already active, preserve SSH first.
if command -v ufw >/dev/null && LC_ALL=C ufw status | grep '^Status: active' >/dev/null; then
    ufw allow 22/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
fi
echo 'Vultr firewall must also permit inbound TCP 22, 80 and 443.'
install -d -m 755 /var/lib/kairos-acme /var/lib/kairos-acme/.well-known \
    /var/lib/kairos-acme/.well-known/acme-challenge
mkdir -p /etc/letsencrypt/renewal-hooks/deploy

files=(-f "$root/compose.yaml" -f "$root/compose.https.yaml" -f "$root/compose.https-bootstrap.yaml")
dc() { docker compose --project-directory "$root" -p "$project" "${files[@]}" "$@"; }
changed=true
python3 "$helper" env "$root" "COMPOSE_PROJECT_NAME=$project" \
    'COMPOSE_FILE=compose.yaml:compose.https.yaml:compose.https-bootstrap.yaml' \
    'NGINX_CONFIG=./deploy/nginx/acme.conf'
python3 "$helper" verify-config "$root" "$project" "$volume" --bootstrap
dc run --rm --no-deps proxy nginx -t
dc up -d --no-deps --force-recreate proxy

probe="kairos-$(openssl rand -hex 12)"
printf '%s' "$probe" >"/var/lib/kairos-acme/.well-known/acme-challenge/$probe"
# The deployment's private umask must not hide this public validation file from Nginx workers.
chmod 644 "/var/lib/kairos-acme/.well-known/acme-challenge/$probe"
actual=$(curl --noproxy '*' --fail --silent --show-error --max-time 15 \
    --retry 10 --retry-connrefused --retry-delay 1 --retry-max-time 30 \
    "http://$domain/.well-known/acme-challenge/$probe")
[[ "$actual" == "$probe" ]]
rm -- "/var/lib/kairos-acme/.well-known/acme-challenge/$probe"
(
    umask 022
    certbot certonly --webroot --webroot-path /var/lib/kairos-acme \
        --cert-name "$domain" -d "$domain" --email "$email" --agree-tos \
        --non-interactive --keep-until-expiring
)

python3 "$helper" env "$root" 'NGINX_CONFIG=./deploy/nginx/https.conf'
dc run --rm --no-deps proxy nginx -t
dc up -d --no-deps --force-recreate proxy
curl --noproxy '*' --fail --silent --show-error --max-time 15 \
    --retry 10 --retry-connrefused --retry-delay 1 --retry-max-time 30 \
    --resolve "$domain:443:127.0.0.1" "https://$domain/api/health"

# Change application URL/cookie policy only after a trusted HTTPS response is available.
python3 "$helper" env "$root" "APP_URL=https://$domain" 'COOKIE_SECURE=true'
dc up -d --no-deps app
dc exec -T app node --input-type=module <<'JS'
for (let attempt = 0; attempt < 30; attempt++) {
    try {
        const response = await fetch('http://127.0.0.1:3000/api/health');
        if (response.ok) process.exit(0);
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
}
process.exit(1);
JS
# App recreation can change its Docker IP. Refresh Nginx's upstream DNS resolution.
dc exec -T proxy nginx -t
dc exec -T proxy nginx -s reload
curl --noproxy '*' --fail --silent --show-error --retry 3 --retry-delay 1 --max-time 15 \
    --retry-connrefused \
    --resolve "$domain:443:127.0.0.1" "https://$domain/api/health"
status=$(curl --noproxy '*' --silent --show-error --output /dev/null --write-out '%{http_code}' \
    --retry 3 --retry-connrefused --retry-delay 1 --max-time 15 \
    --resolve "$domain:80:127.0.0.1" "http://$domain/")
[[ "$status" == 308 ]]

# The final override REPLACES the old port list rather than appending 80/443 to 8080.
files=(-f "$root/compose.yaml" -f "$root/compose.https.yaml")
python3 "$helper" env "$root" 'COMPOSE_FILE=compose.yaml:compose.https.yaml'
python3 "$helper" verify-config "$root" "$project" "$volume"
dc up -d --no-deps --force-recreate proxy
curl --noproxy '*' --fail --silent --show-error --retry 3 --retry-delay 1 --max-time 15 \
    --retry-connrefused \
    "https://$domain/api/health"
python3 "$helper" verify-live "$root" "$backup"

python3 "$helper" hook "$root" "$project"
systemctl enable docker.service
systemctl enable --now certbot.timer
(
    umask 022
    certbot renew --cert-name "$domain" --dry-run --run-deploy-hooks --no-random-sleep-on-renew
)
systemctl is-enabled docker.service certbot.timer
systemctl is-active certbot.timer
dc ps
trap - ERR

echo "HTTPS active: https://$domain. Port 8080 is no longer published. Data fingerprints match."
echo "Rollback files (private): $backup"
echo 'Cloudflare may now be set to Proxied with SSL/TLS Full (strict), never Flexible.'
if [[ -t 0 ]]; then
    python3 "$root/scripts/verify-https-login.py"
else
    echo 'Login verification pending: run python3 scripts/verify-https-login.py interactively.'
fi
