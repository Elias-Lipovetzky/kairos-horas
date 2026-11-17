import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("tls_state", Path(__file__).parents[1] / "scripts/tls-state.py")
tls = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tls)


class TlsStateTests(unittest.TestCase):
    def test_env_patch_preserves_secrets_and_comments(self):
        original = ("# keep this\nPOSTGRES_PASSWORD=\"a$complex#secret\"\n"
                    "DATABASE_URL=postgres://kairos:a$complex@db/kairos\n"
                    "COOKIE_SECURE=false\nAPP_URL=http://149.28.101.92:8080\n")
        result = tls.edit_env(original, {"COOKIE_SECURE": "true", "APP_URL": "https://kairoshoras.com"})
        self.assertIn('POSTGRES_PASSWORD="a$complex#secret"\n', result)
        self.assertIn("DATABASE_URL=postgres://kairos:a$complex@db/kairos\n", result)
        self.assertIn("COOKIE_SECURE=true\n", result)
        self.assertTrue(result.startswith("# keep this\n"))
        with self.assertRaises(ValueError):
            tls.edit_env(original, {"POSTGRES_PASSWORD": "changed"})
        with self.assertRaises(ValueError):
            tls.edit_env(original, {"APP_URL": "https://example.com\nPOSTGRES_PASSWORD=bad"})

    def test_duplicate_keys_and_atomic_private_write(self):
        result = tls.edit_env("APP_URL=one\nAPP_URL=two\nOTHER=value", {"APP_URL": "https://kairoshoras.com"})
        self.assertEqual(result.count("APP_URL="), 1)
        self.assertIn("OTHER=value", result)
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / ".env"
            file.write_text("original")
            tls.atomic_write(file, result)
            self.assertEqual(file.read_text(), result)
            self.assertEqual(file.stat().st_mode & 0o777, 0o600)

    def test_rollback_configuration_escapes_dollar_values(self):
        source = {"services": {"app": {"environment": {"SECRET": "x$Y${z}"}}}}
        result = tls.escaped_dollars(source)
        self.assertEqual(result["services"]["app"]["environment"]["SECRET"], "x$$Y$${z}")
        self.assertEqual(source["services"]["app"]["environment"]["SECRET"], "x$Y${z}")

    def test_volume_change_or_public_backend_prevents_rollout(self):
        config = {"services": {"db": {"volumes": [{"target": "/var/lib/postgresql/data", "source": "data"}]},
                               "app": {}, "proxy": {"ports": [{"published": "80"}, {"published": "443"}]}},
                  "volumes": {"data": {"name": "original_data"}}}
        with patch.object(tls, "compose", return_value=json.dumps(config)):
            tls.verify_config(Path("/app"), "project", "original_data")
            with self.assertRaises(RuntimeError):
                tls.verify_config(Path("/app"), "project", "another_data")
        config["services"]["app"]["ports"] = [{"published": "3000"}]
        with patch.object(tls, "compose", return_value=json.dumps(config)):
            with self.assertRaises(RuntimeError):
                tls.verify_config(Path("/app"), "project", "original_data")

    def test_missing_working_directory_does_not_match_unrelated_database(self):
        candidate = {"Config": {"Labels": {}}, "Mounts": []}
        with patch.object(tls, "command", side_effect=["some-id", json.dumps([candidate])]):
            with self.assertRaises(RuntimeError):
                tls.discover(Path.cwd())

    def test_renewal_hook_scopes_reload_and_stops_after_failed_config_test(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            binary = root / "docker"
            log = root / "calls"
            binary.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$TLS_TEST_LOG"\n'
                              'if [ "$TLS_TEST_FAIL" = 1 ]; then exit 1; fi\n')
            binary.chmod(0o755)
            env = {**os.environ, "PATH": str(root) + os.pathsep + os.environ["PATH"],
                   "TLS_TEST_LOG": str(log), "TLS_TEST_FAIL": "0",
                   "RENEWED_LINEAGE": "/etc/letsencrypt/live/another-domain"}
            hook = Path(__file__).parents[1] / "scripts/tls-renew-hook.sh"
            args = ["bash", str(hook), str(root), "fixture-project"]
            subprocess.run(args, env=env, check=True, capture_output=True)
            self.assertFalse(log.exists())
            env["RENEWED_LINEAGE"] = "/etc/letsencrypt/live/kairoshoras.com"
            subprocess.run(args, env=env, check=True, capture_output=True)
            calls = log.read_text().splitlines()
            self.assertEqual(len(calls), 2)
            self.assertTrue(calls[0].endswith("-p fixture-project exec -T proxy nginx -t"))
            self.assertTrue(calls[1].endswith("-p fixture-project exec -T proxy nginx -s reload"))
            log.unlink()
            env["TLS_TEST_FAIL"] = "1"
            result = subprocess.run(args, env=env, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(len(log.read_text().splitlines()), 1)


if __name__ == "__main__":
    unittest.main()
