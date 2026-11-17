# HTTPS at kairoshoras.com

This deployment keeps the existing PostgreSQL, Node application and Nginx services. It uses Debian's
Certbot with a Let's Encrypt certificate, persistent host storage and automatic renewal. The changes
must be pulled from Git before running the setup on the server. Nothing in these instructions
requires deleting Docker volumes or changing database credentials.

## Before running the setup

Use the Vultr console or SSH as deploy on 149.28.101.92, port 22. If the local Wi-Fi blocks SSH, use
the Vultr console. The repository is /home/deploy/apps/kairos-horas. Run during a maintenance
window: users must pause edits until the data comparison finishes.

In the Vultr firewall, retain SSH TCP 22 and allow inbound TCP 80 and 443. Keep 8080 available until
the setup verifies HTTPS. Do not enable a new host firewall or flush rules. The script adds SSH,
HTTP and HTTPS allowances only if UFW is already active.

In Cloudflare DNS, configure:

| Type | Name | Target        | Initial proxy status |
| ---- | ---- | ------------- | -------------------- |
| A    | @    | 149.28.101.92 | DNS only, grey cloud |

Temporarily use DNS only so Cloudflare cannot redirect the initial HTTP challenge to an origin that
does not yet have HTTPS. Remove incorrect direct AAAA records for this hostname: this configuration
uses the provided IPv4 address. Check propagation before proceeding:

```bash
dig +short NS kairoshoras.com
dig +short @1.1.1.1 A kairoshoras.com
dig +short @8.8.8.8 A kairoshoras.com
dig +short AAAA kairoshoras.com
dig +short CAA kairoshoras.com
```

During initial setup both A lookups must return only 149.28.101.92. If CAA restrictions exist, they
must permit letsencrypt.org. Domain registration was verified through Verisign RDAP as Cloudflare,
Inc.; the delegated nameservers were margot.ns.cloudflare.com and west.ns.cloudflare.com. No
registrar API token is needed by this deployment.

## Apply the committed configuration

```bash
cd /home/deploy/apps/kairos-horas
git status --short
git pull --ff-only origin main
sudo bash scripts/enable-https.sh YOUR_LETS_ENCRYPT_ACCOUNT_EMAIL
```

Replace the email argument with the account email. If Git reports local conflicting changes, review
them before pulling; do not force-reset the server. The setup requires Docker Compose 2.24.4 or
newer for port replacement and installs missing Debian packages for Certbot, DNS checks and TLS. It
does not install another reverse proxy or rebuild application images.

The setup performs these steps:

1. Discovers the running database using this checkout's Compose labels and saves the actual project
   name and named volume. It does not assume the VPS uses the local project's name.
2. Saves the previous environment, rendered Compose configuration, running image IDs, Nginx
   configuration and data fingerprints under /var/backups/kairos/https-TIMESTAMP. This backup is
   private and contains secrets; never commit or share it. It is a configuration rollback, not a
   database restore: this operation never writes business data.
3. Exposes port 80 on the existing Nginx service, serves ACME challenges and obtains the
   certificate. The old 8080 binding is kept during this stage.
4. Tests Nginx, activates TLS and verifies a trusted HTTPS response before setting:

   ```dotenv
   APP_URL=https://kairoshoras.com
   COOKIE_SECURE=true
   ```

5. Restarts only app and proxy, leaving the database container running. It then replaces the
   published port list with exactly 80 and 443, so Docker cannot leave 8080 exposed through an
   additive Compose merge. Neither app:3000 nor db:5432 is published.
6. Compares database fingerprints and the actual running container/volume/port configuration,
   enables Docker on boot, installs the renewal hook, enables certbot.timer and tests renewal
   against Let's Encrypt's staging service, including the reload hook.
7. If run interactively, prompts for an existing Kairos account to verify HTTPS login, session
   identity and Secure, HttpOnly, SameSite=Strict cookies. Credentials and cookie values are not
   written to disk or logs. Failed login verification leaves working HTTPS active for diagnosis.

The script only edits APP_URL, COOKIE_SECURE, NGINX_CONFIG, COMPOSE_PROJECT_NAME and COMPOSE_FILE
inside .env, preserving other lines and the file owner. It does not modify database credentials.
Normal docker compose commands subsequently use the saved production override and existing project.
The old APP_PORT=8080 value is not used to publish ports in the final production override.

If setup cannot identify the running database, list the existing projects without changing them:

```bash
sudo docker ps --filter label=com.docker.compose.service=db --format 'table {{.Names}}\t{{.Label "com.docker.compose.project"}}\t{{.Status}}'
```

Older containers can retain their original checkout path in Docker labels. Setup first checks that
path, then the configured Compose project. It always verifies the running named volume matches the
rendered Compose configuration. If the existing project has another name, specify the name shown
above. For example, for project herramientas:

```bash
sudo bash scripts/enable-https.sh YOUR_LETS_ENCRYPT_ACCOUNT_EMAIL --project herramientas
```

This option selects an existing running project; it does not create or reset a database. If no
database is running, start the previously existing deployment before retrying. Do not create a new
project or remove volumes to work around this guard.

If curl reports error 35 / Connection reset by peer immediately after Nginx starts, a readiness
request may have reached Docker before Nginx was ready to complete a TLS handshake. The read-only
checks now retry connection resets within a bounded budget, without disabling certificate checks or
repeating login/certificate-issuance requests. A persistent failure still rolls back and prints the
deployment stage and exit code. Proxy logs and the active Nginx configuration are saved privately
alongside the rollback files before the old configuration is restored. Pull the latest main before
retrying. If it continues, capture the stage/error and inspect those diagnostic files; do not delete
database volumes.

## Cloudflare after HTTPS is verified

You can re-enable the orange Proxied setting for the A record. Select SSL/TLS encryption mode Full
(strict). Do not select Flexible, which sends HTTP to an origin that redirects to HTTPS. After
enabling the proxy, public DNS returns Cloudflare IPs; check the A record's origin address in the
Cloudflare dashboard rather than expecting dig to expose it.

The application continues trusting one reverse proxy: Nginx. The production Nginx configuration
overwrites forwarding headers and accepts CF-Connecting-IP only from Cloudflare's published
networks. Direct clients cannot forge their address with forwarding headers. Review the committed
Cloudflare address list when the provider updates its ranges.

This certificate covers the root domain. To add www later, configure its DNS, include it in the
certificate and add an HTTPS redirect server. Do not point www at the app before its certificate
name is covered.

## Validate from an external device

```bash
dig +short kairoshoras.com
sudo docker compose ps
curl -I http://kairoshoras.com
curl -I https://kairoshoras.com
curl --fail https://kairoshoras.com/api/health
curl --fail --resolve kairoshoras.com:443:149.28.101.92 https://kairoshoras.com/api/health
```

HTTP must redirect with status 308 and HTTPS must return 200 with a trusted certificate. The last
command checks the origin certificate even after enabling the Cloudflare proxy; do not use -k.
Verify that direct 149.28.101.92:8080 is no longer reachable, then remove its Vultr firewall rule.
Only the proxy should show published Docker ports, exactly 80 and 443.

If interactive login verification was skipped, run it now and then test the browser:

```bash
python3 scripts/verify-https-login.py
```

Docker can bypass UFW for published container ports. This deployment removes the 8080 mapping and
checks that the backend and database have no published mappings; it does not rely on a UFW deny rule
to conceal an existing Docker mapping. No Docker-generated firewall chains are flushed.

## Renewal and reboot

Certificates remain on the VPS in /etc/letsencrypt, mounted read-only into the existing proxy. The
ACME webroot is /var/lib/kairos-acme. Both remain after proxy recreation. Certbot's systemd timer
renews certificates; /etc/letsencrypt/renewal-hooks/deploy/kairos-reload tests Nginx and gracefully
reloads it after successful renewal. It only reloads Kairos for this certificate's lineage.
Challenges are served on HTTP and HTTPS so Cloudflare HTTPS redirects do not break renewals.

```bash
sudo systemctl is-enabled docker.service certbot.timer
sudo systemctl list-timers certbot.timer
sudo certbot certificates
sudo certbot renew --cert-name kairoshoras.com --dry-run --run-deploy-hooks --no-random-sleep-on-renew
```

All three services retain restart: unless-stopped. Docker's enabled system service starts them after
a VPS reboot; certbot.timer resumes renewal checks. No reboot is required for this setup.

## Rollback

The setup prints its private backup directory. Any configuration/issuance/renewal test failure
before completion triggers rollback of app/proxy automatically. The database is not restarted,
recreated or restored. To roll back manually:

```bash
sudo bash scripts/rollback-https.sh /var/backups/kairos/https-THE_DIRECTORY_PRINTED
```

This restores the old .env, existing image IDs and resolved Compose settings for app/proxy. The
previous HTTP endpoint should be available again at http://149.28.101.92:8080. If Cloudflare is
using Full (strict), keep it DNS only while diagnosing a rollback to HTTP. An issued certificate is
retained on disk for the next attempt; the previous renewal hook is restored.

## Repository checks

```bash
bash -n scripts/enable-https.sh scripts/lib/tls-http.sh scripts/tls-renew-hook.sh scripts/rollback-https.sh
python3 -B test/tls-state.test.py
KAIROS_TLS_TEST=1 node --test test/tls-config.test.js
```

The Docker test uses an isolated project with temporary certificates and a fixture upstream, checks
HTTP/HTTPS challenges, redirects, forwarding headers and certificate reload, and tears down only its
own resources. It does not request a real certificate or access production data.

References: [Certbot webroot and renewal](https://eff-certbot.readthedocs.io/en/stable/using.html),
[Let's Encrypt HTTP-01](https://letsencrypt.org/docs/challenge-types/#http-01-challenge),
[Nginx TLS](https://nginx.org/en/docs/http/configuring_https_servers.html),
[Compose port replacement](https://docs.docker.com/reference/compose-file/merge/#replace-value),
[Docker and firewalls](https://docs.docker.com/engine/network/packet-filtering-firewalls/), and
[Cloudflare Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/).
