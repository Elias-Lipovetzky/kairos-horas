#!/usr/bin/env python3
"""Small deployment helpers. Never print Compose environment values or database rows."""

import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path


ENV_KEYS = {"APP_URL", "COOKIE_SECURE", "NGINX_CONFIG", "COMPOSE_FILE", "COMPOSE_PROJECT_NAME"}


def command(args, cwd=None, input=None):
    result = subprocess.run(args, cwd=cwd, input=input, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or "Deployment command failed")
    return result.stdout


def atomic_write(path, content, owner=None):
    path = Path(path)
    previous = path.stat() if path.exists() else None
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=".kairos-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as stream:
            stream.write(content)
        os.chmod(temporary, 0o600)
        if owner is not None:
            os.chown(temporary, *owner)
        elif previous is not None:
            os.chown(temporary, previous.st_uid, previous.st_gid)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def edit_env(content, changes):
    if not set(changes).issubset(ENV_KEYS):
        raise ValueError("Refusing to change keys outside the HTTPS allowlist")
    if any("\n" in value or "\r" in value for value in changes.values()):
        raise ValueError("Environment values must occupy one line")
    result, seen = [], set()
    for line in content.splitlines(keepends=True):
        match = re.match(r"^(?:export\s+)?([A-Za-z_][A-Za-z_0-9]*)=", line)
        key = match.group(1) if match else None
        if key in changes:
            if key not in seen:
                result.append(f"{key}={changes[key]}\n")
                seen.add(key)
        else:
            result.append(line)
    if result and not result[-1].endswith("\n"):
        result[-1] += "\n"
    result.extend(f"{key}={value}\n" for key, value in changes.items() if key not in seen)
    return "".join(result)


def compose(root, project, args):
    return command(["docker", "compose", "--project-directory", str(root), "-p", project, *args], cwd=root)


def expected_volume(config):
    mount = next((m for m in config["services"]["db"].get("volumes", [])
                  if m.get("target") == "/var/lib/postgresql/data"), None)
    if not mount or mount.get("type", "volume") != "volume":
        raise RuntimeError("Expected PostgreSQL to use a named volume in Compose")
    name = config.get("volumes", {}).get(mount["source"], {}).get("name")
    if not name:
        raise RuntimeError("Cannot resolve the PostgreSQL volume name from Compose")
    return name


def discover(root, project_hint=None):
    ids = command(["docker", "ps", "-q", "--filter", "label=com.docker.compose.service=db"]).split()
    containers = json.loads(command(["docker", "inspect", *ids])) if ids else []
    if project_hint:
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", project_hint):
            raise RuntimeError("Invalid Compose project name")
        project = project_hint
    else:
        candidates = [c for c in containers if
                      c["Config"]["Labels"].get("com.docker.compose.project") and
                      c["Config"]["Labels"].get("com.docker.compose.project.working_dir") and
                      Path(c["Config"]["Labels"]["com.docker.compose.project.working_dir"]).resolve() == root]
        if len(candidates) == 1:
            project = candidates[0]["Config"]["Labels"]["com.docker.compose.project"]
        else:
            # Docker retains creation-time paths after a checkout moves. The configured project
            # is a safe fallback only when its running DB mounts the SAME resolved named volume.
            config = json.loads(command(["docker", "compose", "--project-directory", str(root),
                                         "config", "--format", "json"], cwd=root))
            project = config["name"]
    candidates = [c for c in containers
                  if c["Config"]["Labels"].get("com.docker.compose.project") == project]
    if len(candidates) != 1:
        available = sorted({c["Config"]["Labels"].get("com.docker.compose.project", "unknown")
                            for c in containers})
        raise RuntimeError(f"Cannot identify one running db for project '{project}'. "
                           f"Running database projects: {', '.join(available) or 'none'}. "
                           "Retry enable-https.sh EMAIL --project NAME using the existing project's name. "
                           "Do not start a new empty project or delete volumes.")
    db = candidates[0]
    volume = [m for m in db["Mounts"] if m["Destination"] == "/var/lib/postgresql/data"]
    if len(volume) != 1 or volume[0]["Type"] != "volume":
        raise RuntimeError("Expected an existing PostgreSQL named volume")
    config = json.loads(compose(root, project, ["config", "--format", "json"]))
    if volume[0]["Name"] != expected_volume(config):
        raise RuntimeError("The running database volume differs from this project's Compose configuration; "
                           "nothing was changed. Check the project name and existing volume configuration.")
    return {"root": str(root), "project": project,
            "db_id": db["Id"], "volume": volume[0]["Name"]}


def fingerprints(root, project):
    # These tables must not change during the maintenance window. Sessions are intentionally excluded.
    tables = ["users", "employees", "places", "owners", "place_owners", "records", "audit", "notifications"]
    expressions = []
    for table in tables:
        # Table names are fixed above, never supplied by a caller.
        expressions.append(f"'{table}', (SELECT json_build_object('count',count(*),"
                           f"'hash',md5(COALESCE(string_agg(digest,'' ORDER BY digest),''))) "
                           f"FROM (SELECT md5(row_to_json(t)::text) digest FROM {table} t) source_rows)")
    sql = "SELECT json_build_object(" + ",".join(expressions) + ")"
    text = compose(root, project, ["exec", "-T", "db", "sh", "-c",
                   'PGPASSWORD="$POSTGRES_PASSWORD" psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1 -c "$1"',
                   "kairos-https", sql])
    return json.loads(text)


def escaped_dollars(value):
    if isinstance(value, str):
        return value.replace("$", "$$")
    if isinstance(value, list):
        return [escaped_dollars(v) for v in value]
    if isinstance(value, dict):
        return {k: escaped_dollars(v) for k, v in value.items()}
    return value


def snapshot(root, backup, project_hint=None):
    state = discover(root, project_hint)
    project = state["project"]
    config = json.loads(compose(root, project, ["config", "--format", "json"]))
    # Pin rollback to the actual currently-running images, without rebuilding or pulling.
    for service in ("app", "proxy"):
        cid = compose(root, project, ["ps", "-q", service]).strip()
        if not cid:
            raise RuntimeError(f"{service} is not running")
        current = json.loads(command(["docker", "inspect", cid]))[0]
        config["services"][service]["image"] = current["Image"]
        config["services"][service].pop("build", None)
    env = root / ".env"
    info = env.stat()
    state["env_owner"] = [info.st_uid, info.st_gid]
    state["data"] = fingerprints(root, project)
    atomic_write(backup / "env.before", env.read_text())
    atomic_write(backup / "compose.before.json", json.dumps(escaped_dollars(config)))
    atomic_write(backup / "nginx.before.txt", compose(root, project, ["exec", "-T", "proxy", "nginx", "-T"]))
    hook = Path("/etc/letsencrypt/renewal-hooks/deploy/kairos-reload")
    if hook.exists():
        atomic_write(backup / "hook.before", hook.read_text())
    atomic_write(backup / "state.json", json.dumps(state, indent=2))
    return state


def verify_config(root, project, volume, bootstrap=False):
    config = json.loads(compose(root, project, ["config", "--format", "json"]))
    for service in ("app", "db"):
        if config["services"][service].get("ports"):
            raise RuntimeError(f"{service} must not publish ports")
    mount = next(m for m in config["services"]["db"]["volumes"] if m["target"] == "/var/lib/postgresql/data")
    if config["volumes"][mount["source"]]["name"] != volume:
        raise RuntimeError("The new configuration would use a different database volume")
    ports = {str(p["published"]) for p in config["services"]["proxy"]["ports"]}
    if not {"80", "443"}.issubset(ports) or (not bootstrap and ports != {"80", "443"}):
        raise RuntimeError("Unexpected proxy port publication")


def verify_live(root, backup):
    before = json.loads((backup / "state.json").read_text())
    current = discover(root, before["project"])
    if current["db_id"] != before["db_id"] or current["volume"] != before["volume"]:
        raise RuntimeError("The database container or volume changed unexpectedly")
    for service in ("db", "app", "proxy"):
        cid = compose(root, before["project"], ["ps", "-q", service]).strip()
        info = json.loads(command(["docker", "inspect", cid]))[0]
        bindings = info["HostConfig"].get("PortBindings") or {}
        if service != "proxy" and any(bindings.values()):
            raise RuntimeError(f"{service} has public port bindings")
        if service == "proxy":
            ports = {b["HostPort"] for values in bindings.values() for b in (values or [])}
            if ports != {"80", "443"}:
                raise RuntimeError("Proxy still publishes unexpected ports")
        if info["HostConfig"]["RestartPolicy"]["Name"] != "unless-stopped":
            raise RuntimeError(f"{service} is missing its restart policy")
    after = fingerprints(root, before["project"])
    atomic_write(backup / "data.after.json", json.dumps(after, indent=2))
    if after != before["data"]:
        raise RuntimeError("Data changed during deployment; rollback preserves the database. Check concurrent activity")


def rollback(backup):
    backup = backup.resolve()
    if not backup.is_relative_to(Path("/var/backups/kairos")):
        raise RuntimeError("Rollback must use a backup under /var/backups/kairos")
    state = json.loads((backup / "state.json").read_text())
    root = Path(state["root"])
    atomic_write(root / ".env", (backup / "env.before").read_text(), state["env_owner"])
    hook = Path("/etc/letsencrypt/renewal-hooks/deploy/kairos-reload")
    if (backup / "hook.before").exists():
        atomic_write(hook, (backup / "hook.before").read_text())
        hook.chmod(0o755)
    elif hook.exists():
        hook.unlink()
    compose(root, state["project"], ["-f", str(backup / "compose.before.json"),
                                   "up", "-d", "--no-deps", "app", "proxy"])


def main():
    action = sys.argv[1]
    if action == "rollback":
        rollback(Path(sys.argv[2]))
        return
    root = Path(sys.argv[2]).resolve()
    if action == "env":
        changes = dict(value.split("=", 1) for value in sys.argv[3:])
        atomic_write(root / ".env", edit_env((root / ".env").read_text(), changes))
    elif action == "snapshot":
        state = snapshot(root, Path(sys.argv[3]), sys.argv[4] if len(sys.argv) > 4 else None)
        print(state["project"])
    elif action == "verify-config":
        verify_config(root, sys.argv[3], sys.argv[4], "--bootstrap" in sys.argv)
    elif action == "verify-live":
        verify_live(root, Path(sys.argv[3]))
    elif action == "hook":
        project = sys.argv[3]
        script = shlex.quote(str(root / "scripts/tls-renew-hook.sh"))
        content = f"#!/bin/sh\nexec /bin/bash {script} {shlex.quote(str(root))} {shlex.quote(project)}\n"
        path = Path("/etc/letsencrypt/renewal-hooks/deploy/kairos-reload")
        atomic_write(path, content)
        path.chmod(0o755)
    else:
        raise RuntimeError("Unknown TLS helper action")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
