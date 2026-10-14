"""Codemode settings tests: temporary directories only."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("pi_tools", ROOT / "scripts/install-pi-tools.py")
tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tools)


class PiToolsTests(unittest.TestCase):
    def test_merge_preserves_selection(self):
        cases = [
            ({}, ["+codemode"]),
            ({"defaultTools": []}, ["codemode"]),
            ({"defaultTools": ["read", "bash"]}, ["read", "bash", "codemode"]),
            ({"defaultTools": ["-write", "-codemode"]}, ["-write", "+codemode"]),
            ({"defaultTools": ["+codemode"]}, ["+codemode"]),
            ({"defaultTools": ["read", "codemode"]}, ["read", "codemode"]),
        ]
        for settings, expected in cases:
            with self.subTest(settings=settings):
                settings = {**settings, "theme": "test", "packages": ["keep"]}
                result = tools.enable_codemode(settings)
                self.assertEqual(result["defaultTools"], expected)
                self.assertEqual(result["theme"], "test")
                self.assertEqual(result["packages"], ["keep"])
                self.assertEqual(tools.enable_codemode(result), result)

    def test_bundled_search_disabled_without_losing_other_resources(self):
        settings = {
            "packages": [
                "git:github.com/woojung3/pi-bootstrap@v0.6.0",
                {"source": "git:https://github.com/woojung3/pi-bootstrap.git@main",
                 "extensions": ["extensions/*.ts", "+extensions/google-data-store-search/index.ts"],
                 "skills": ["skills/phone-notify"]},
                "npm:unrelated",
                "git:github.com/woojung3/pi-bootstrap-other",
            ],
            "extensions": ["explicit-user-choice.ts"],
        }
        result = tools.disable_bundled_search(settings)
        first, second, *rest = result["packages"]
        self.assertEqual(first["extensions"], [tools.SEARCH_EXCLUSION])
        self.assertIn(tools.SEARCH_EXCLUSION, second["extensions"])
        self.assertEqual(second["skills"], ["skills/phone-notify"])
        self.assertEqual(second["extensions"][:2], settings["packages"][1]["extensions"])
        self.assertEqual(rest, settings["packages"][2:])
        self.assertEqual(result["extensions"], settings["extensions"])
        self.assertEqual(tools.disable_bundled_search(result), result)
        self.assertIsInstance(settings["packages"][0], str)

    def test_disabled_extensions_remain_all_disabled(self):
        settings = {"packages": [{"source": "git:github.com/woojung3/pi-bootstrap@v0.6.0", "extensions": []}]}
        self.assertEqual(tools.disable_bundled_search(settings), settings)
        self.assertEqual(tools.disable_bundled_search({}), {})

    def test_invalid_package_filters(self):
        for packages in ("bad", [None], [{"source": "git:github.com/woojung3/pi-bootstrap", "extensions": "bad"}]):
            with self.assertRaises(ValueError):
                tools.disable_bundled_search({"packages": packages})

    def test_invalid_settings(self):
        for settings in [[], {"defaultTools": "bash"}, {"defaultTools": [None]}]:
            with self.assertRaises(ValueError):
                tools.enable_codemode(settings)

    def test_backup_permissions_and_idempotence(self):
        with tempfile.TemporaryDirectory() as d:
            agent = Path(d)
            path = agent / "settings.json"
            old = '{"theme":"keep"}\n'
            path.write_text(old)
            self.assertTrue(tools.install(agent))
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            backups = list((agent / "backups").iterdir())
            self.assertEqual(len(backups), 1)
            self.assertEqual(backups[0].read_text(), old)
            self.assertEqual(backups[0].stat().st_mode & 0o777, 0o600)
            self.assertFalse(tools.install(agent))
            self.assertEqual(list((agent / "backups").iterdir()), backups)

    def test_new_settings(self):
        with tempfile.TemporaryDirectory() as d:
            agent = Path(d) / "agent"
            tools.install(agent)
            self.assertEqual(json.loads((agent / "settings.json").read_text()),
                             {"defaultTools": ["+codemode"]})

    def test_refuse_disabled_builtin_or_symlink(self):
        with tempfile.TemporaryDirectory() as d:
            agent = Path(d)
            path = agent / "settings.json"
            old = '{"extensions":["-builtin:codemode"]}'
            path.write_text(old)
            with self.assertRaises(ValueError):
                tools.install(agent)
            self.assertEqual(path.read_text(), old)
            path.unlink()
            target = agent / "target.json"
            target.write_text('{}')
            path.symlink_to(target)
            with self.assertRaises(ValueError):
                tools.install(agent)
            self.assertEqual(target.read_text(), '{}')
