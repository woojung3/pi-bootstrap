"""Validate packaged skill discovery without models, credentials or ntfy calls."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class PhoneSkillTests(unittest.TestCase):
    def test_manifest_and_skill(self):
        package = json.loads((ROOT / 'package.json').read_text())
        self.assertIn('./skills', package['pi']['skills'])
        text = (ROOT / 'skills/phone-notify/SKILL.md').read_text()
        self.assertTrue(text.startswith('---\nname: phone-notify\ndescription:'))
        self.assertIn('host-notify', text)
        self.assertIn('4096', text)
        self.assertNotIn('NTFY_PASSWORD=', text)

    @unittest.skipUnless(shutil.which('pi'), 'pi is not installed')
    def test_real_pi_discovers_packaged_skill(self):
        with tempfile.TemporaryDirectory() as directory:
            agent = Path(directory) / 'agent'
            agent.mkdir()
            (agent / 'settings.json').write_text(json.dumps({'packages': [{'source': str(ROOT), 'extensions': []}]}))
            env = {k: v for k, v in os.environ.items() if not k.startswith('HERDR_')}
            env.update(PI_CODING_AGENT_DIR=str(agent), PI_OFFLINE='1')
            result = subprocess.run(
                ['pi', '--mode', 'rpc', '--offline', '--no-session', '--no-approve', '--no-context-files', '--no-extensions', '--no-prompt-templates'],
                input=json.dumps({'id': 'skills', 'type': 'get_commands'}) + '\n',
                cwd=directory, env=env, capture_output=True, text=True, timeout=30,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            records = [json.loads(line) for line in result.stdout.splitlines() if line.startswith('{')]
            response = next(r for r in records if r.get('id') == 'skills')
            self.assertTrue(response['success'])
            commands = response['data']['commands']
            self.assertTrue(any(c['name'] == 'skill:phone-notify' for c in commands), commands)


if __name__ == '__main__':
    unittest.main()
