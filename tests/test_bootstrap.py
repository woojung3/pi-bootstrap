"""Validate installation contracts without network calls or changing user settings."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class BootstrapTests(unittest.TestCase):
    def test_manifest_exposes_only_search(self):
        package = json.loads((ROOT / "package.json").read_text())
        self.assertEqual(
            package["pi"],
            {"extensions": ["./packages/pi-google-data-store-search/index.ts"]},
        )
        for resource in package["pi"]["extensions"]:
            self.assertTrue((ROOT / resource).is_file())

    def test_lockfile_version_matches(self):
        package = json.loads((ROOT / "package.json").read_text())
        lock = json.loads((ROOT / "package-lock.json").read_text())
        self.assertEqual(package["version"], lock["version"])
        self.assertEqual(package["version"], lock["packages"][""]["version"])

    def test_bootstrap_uses_one_git_package_and_isolated_agent_directory(self):
        package = json.loads((ROOT / "package.json").read_text())
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            binary = temp / "bin"
            binary.mkdir()
            pi = binary / "pi"
            pi.write_text('#!/bin/sh\nprintf "%s|%s\\n" "$PI_AGENT_DIR" "$*" >> "$PI_TEST_LOG"\n')
            pi.chmod(0o755)
            agent = temp / "agent"
            log = temp / "calls"
            env = dict(os.environ, PATH=str(binary) + os.pathsep + os.environ["PATH"],
                       PI_AGENT_DIR=str(agent), PI_TEST_LOG=str(log))
            subprocess.run([str(ROOT / "scripts/bootstrap.sh")], env=env,
                           capture_output=True, text=True, check=True)
            calls = log.read_text().splitlines()
            self.assertEqual(calls, [
                f"{agent}|install git:github.com/woojung3/pi-bootstrap@v{package['version']}",
                f"{agent}|install npm:@narumitw/pi-statusline",
                f"{agent}|install npm:@narumitw/pi-goal",
                f"{agent}|install npm:@narumitw/pi-usage",
            ])
            self.assertEqual((agent / "models.json").read_bytes(), (ROOT / "config/models.json").read_bytes())
            self.assertEqual((agent / "models.json").stat().st_mode & 0o777, 0o600)

    def test_bootstrap_does_not_write_envrc(self):
        script = (ROOT / "scripts/bootstrap.sh").read_text()
        self.assertNotIn('cp "$ROOT/envrc.example"', script)
        self.assertNotIn("direnv allow", script)


if __name__ == "__main__":
    unittest.main()
