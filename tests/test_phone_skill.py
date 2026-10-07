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
        self.assertIn("--body '/absolute/path/to/script.sh'", text)
        self.assertIn("--attach '/absolute/path/to/file.txt'", text)
        self.assertIn('message.txt', text)
        self.assertIn('24 hours', text)
        self.assertNotIn('NTFY_PASSWORD=', text)

    def test_transport_instructions(self):
        text = (ROOT / 'skills/phone-notify/SKILL.md').read_text()
        self.assertIn('jwlee@minipc', text)
        self.assertNotIn('tailc09822.ts.net', text)
        self.assertIn('BatchMode=yes', text)
        self.assertIn('StrictHostKeyChecking=yes', text)
        self.assertIn('--body -', text)
        self.assertIn('--attach -', text)
        self.assertIn('attachment.bin', text)
        self.assertIn('Never switch routes after a send attempt', text)
        self.assertIn('Do not pipe a remote', text)

    def test_local_route_requires_complete_environment(self):
        text = (ROOT / 'skills/phone-notify/SKILL.md').read_text()
        check = text.split('```sh\n', 1)[1].split('```', 1)[0]
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            sender = home / '.local/bin/host-notify'
            secrets = home / '.local/bin/host-secrets'
            config = home / '.config/herdr-notifier/config.json'
            for path in (sender, secrets, config):
                path.parent.mkdir(parents=True, exist_ok=True)
            for mask in range(8):
                for bit, path in enumerate((sender, secrets, config)):
                    path.unlink(missing_ok=True)
                    if mask & (1 << bit):
                        path.touch(mode=0o700)
                result = subprocess.run(['sh', '-c', check], env={**os.environ, 'HOME': directory})
                self.assertEqual(result.returncode == 0, mask == 7)
            sender.chmod(0o600)
            self.assertNotEqual(subprocess.run(['sh', '-c', check], env={**os.environ, 'HOME': directory}).returncode, 0)

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
