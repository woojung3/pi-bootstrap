"""Offline catalog regression tests; no provider requests or real credentials."""

import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import shutil
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("verify_models", ROOT / "scripts/verify-models.py")
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)


class ModelCatalogTests(unittest.TestCase):
    def setUp(self):
        self.config = json.loads((ROOT / "config/models.json").read_text())
        self.models = self.config["providers"]["litellm"]["models"]
        self.by_id = {m["id"]: m for m in self.models}

    def validate(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "models.json"
            path.write_text(json.dumps(self.config))
            original = verify.MODEL_FILE
            try:
                verify.MODEL_FILE = path
                with contextlib.redirect_stdout(io.StringIO()):
                    verify.main()
            finally:
                verify.MODEL_FILE = original

    @unittest.skipUnless(shutil.which("pi") and shutil.which("node"), "Pi and Node required")
    def test_installed_pi_thinking_mapping_offline(self):
        executable = Path(shutil.which("pi")).resolve()
        candidates = [parent / "node_modules/@earendil-works/pi-ai/dist/models.js"
                      for parent in executable.parents]
        module = next((path for path in candidates if path.is_file()), None)
        if module is None:
            self.skipTest("installed pi-ai module not available")
        script = """
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const {getSupportedThinkingLevels, clampThinkingLevel, calculateCost} = await import(process.argv[1]);
const models = JSON.parse(readFileSync(process.argv[2])).providers.litellm.models;
for (const id of ['sonnet', 'claude-sonnet-5-5', 'haiku', 'claude-haiku-5-5']) {
    const model = models.find(m => m.id === id);
    const sonnet = id.includes('sonnet');
    assert.deepEqual(getSupportedThinkingLevels(model),
        [...(sonnet ? [] : ['off']), 'minimal', 'low', 'medium', 'high']);
    assert.equal(clampThinkingLevel(model, 'off'), sonnet ? 'minimal' : 'off');
    const usage = {input: 0, output: 0, cacheRead: 0, cacheWrite: 1000000,
                   cacheWrite1h: 1000000, cost: {}};
    assert.equal(calculateCost(model, usage).cacheWrite, sonnet ? 4 : 1);
}
"""
        subprocess.run(["node", "--input-type=module", "-e", script,
                        module.as_uri(), str(ROOT / "config/models.json")], check=True)

    def test_current_catalog(self):
        self.validate()

    def test_required_models_cannot_disappear(self):
        for model_id in (*verify.REQUIRED_MODELS, "sonnet", "haiku"):
            with self.subTest(model=model_id):
                model = self.by_id[model_id]
                self.models.remove(model)
                with self.assertRaises(SystemExit):
                    self.validate()
                self.models.append(model)

    def test_retired_and_deferred_models_rejected(self):
        for model_id in ("grok-4.3", "grok-4.5", "gemini-4-argon", "gemini-4-argon-preview"):
            with self.subTest(model=model_id):
                self.models.append({"id": model_id})
                with self.assertRaises(SystemExit):
                    self.validate()
                self.models.pop()

    def test_metadata_regressions_rejected(self):
        for model_id in ("sonnet", "claude-sonnet-5-5", "haiku", "claude-haiku-5-5"):
            for field, value in (
                ("contextWindow", 200000), ("maxTokens", 8192),
                ("input", ["text"]), ("reasoning", False),
                ("cost", {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0}),
                ("thinkingLevelMap", {"off": "between_tools"}),
                ("compat", {"supportsReasoningEffort": False}),
            ):
                with self.subTest(model=model_id, field=field):
                    model = self.by_id[model_id]
                    original = copy.deepcopy(model)
                    model[field] = value
                    with self.assertRaises(SystemExit):
                        self.validate()
                    model.clear()
                    model.update(original)

    def test_matching_aliases_cannot_hide_wrong_prices_or_thinking(self):
        for field, value in (("cost", {}), ("thinkingLevelMap", {"off": "none"})):
            with self.subTest(field=field):
                originals = [copy.deepcopy(self.by_id[key]) for key in ("sonnet", "claude-sonnet-5-5")]
                for model in originals:
                    self.by_id[model["id"]][field] = value
                with self.assertRaises(SystemExit):
                    self.validate()
                for model in originals:
                    self.by_id[model["id"]].update(model)


if __name__ == "__main__":
    unittest.main()
