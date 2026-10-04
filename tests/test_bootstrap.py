"""Installer tests use private temp directories; never modify the user's Pi setup."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class BootstrapTests(unittest.TestCase):
    def test_manifest_paths_and_single_dependency_root(self):
        package = json.loads((ROOT / "package.json").read_text())
        paths = package["pi"]["extensions"]
        self.assertIn("./extensions/google-data-store-search/index.ts", paths)
        self.assertEqual(len(paths), len(set(paths)))
        for resource in paths:
            self.assertTrue((ROOT / resource).is_file())
        self.assertFalse(list((ROOT / "extensions").rglob("package-lock.json")))

    def test_lockfile_version_matches(self):
        package = json.loads((ROOT / "package.json").read_text())
        lock = json.loads((ROOT / "package-lock.json").read_text())
        self.assertEqual(package["version"], lock["version"])
        self.assertEqual(package["version"], lock["packages"][""]["version"])

    def run_bootstrap(self, fail=False):
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            binary = temp / "bin"
            binary.mkdir()
            pi = binary / "pi"
            pi.write_text(
                '#!/bin/sh\n'
                'printf "%s|%s\\n" "$PI_CODING_AGENT_DIR" "$*" >> "$PI_TEST_LOG"\n'
                'if [ "${PI_TEST_FAIL:-}" = 1 ] || [ "$2" = "${PI_TEST_FAIL_SOURCE:-}" ]; then exit 1; fi\n'
            )
            pi.chmod(0o755)
            agent = temp / "agent"
            agent.mkdir()
            models = '{"providers":{"test-only":{}}}\n'
            settings = '{"theme":"test-only"}\n'
            (agent / "models.json").write_text(models)
            (agent / "settings.json").write_text(settings)
            log = temp / "calls"
            env = dict(os.environ, PATH=str(binary) + os.pathsep + os.environ["PATH"],
                       PI_CODING_AGENT_DIR=str(agent), PI_TEST_LOG=str(log),
                       PI_TEST_FAIL="1" if fail is True else "0",
                       PI_TEST_FAIL_SOURCE=fail if isinstance(fail, str) else "")
            result = subprocess.run([str(ROOT / "scripts/bootstrap.sh")], env=env, capture_output=True, text=True)
            backups = list((agent / "backups").glob("settings-*.json"))
            self.assertEqual(len(backups), 1)
            self.assertEqual(backups[0].read_text(), settings)
            self.assertEqual(backups[0].stat().st_mode & 0o777, 0o600)
            if fail:
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual((agent / "models.json").read_text(), models)
                self.assertFalse(list((agent / "backups").glob("models-*.json")))
                return
            self.assertEqual(result.returncode, 0, result.stderr)
            package = json.loads((ROOT / "package.json").read_text())
            config = json.loads((ROOT / "config/packages.json").read_text())
            sources = [f"git:{config['repository']}@v{package['version']}", *config["external"]]
            self.assertEqual(log.read_text().splitlines(), [f"{agent}|install {source} --no-approve" for source in sources])
            self.assertEqual((agent / "models.json").read_bytes(), (ROOT / "config/models.json").read_bytes())
            self.assertEqual((agent / "models.json").stat().st_mode & 0o777, 0o600)
            model_backups = list((agent / "backups").glob("models-*.json"))
            self.assertEqual(len(model_backups), 1)
            self.assertEqual(model_backups[0].read_text(), models)
            (agent / "models.json").chmod(0o644)
            subprocess.run([str(ROOT / "scripts/install-pi-config.sh")], env=env, capture_output=True, check=True)
            self.assertEqual(len(list((agent / "backups").glob("models-*.json"))), 1)
            self.assertEqual((agent / "models.json").stat().st_mode & 0o777, 0o600)

    def test_success_backs_up_and_applies_models_last(self):
        self.run_bootstrap()

    def test_package_failure_preserves_existing_models(self):
        self.run_bootstrap(fail=True)

    def test_later_package_failure_also_preserves_models(self):
        self.run_bootstrap(fail="npm:@narumitw/pi-goal")

    @unittest.skipUnless(shutil.which("pi"), "pi is not installed")
    def test_real_pi_honors_agent_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            agent = Path(directory)
            (agent / "settings.json").write_text(json.dumps({"packages": ["npm:pi-bootstrap-directory-probe"]}))
            env = dict(os.environ, PI_CODING_AGENT_DIR=directory, PI_OFFLINE="1")
            result = subprocess.run(["pi", "list"], env=env, capture_output=True, text=True, check=True, timeout=30)
            self.assertIn("npm:pi-bootstrap-directory-probe", result.stdout)
            self.assertNotIn("@narumitw", result.stdout)

    def test_bootstrap_does_not_authorize_or_write_envrc(self):
        script = (ROOT / "scripts/bootstrap.sh").read_text()
        self.assertNotIn('cp "$ROOT/envrc.example"', script)
        self.assertNotIn("direnv allow", script)


if __name__ == "__main__":
    unittest.main()
