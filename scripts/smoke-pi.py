#!/usr/bin/env python3
"""Run real Pi RPC with isolated settings; no model or Google API calls."""

import asyncio
import json
import os
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parents[1]


async def smoke():
    with tempfile.TemporaryDirectory(prefix="pi-bootstrap-smoke-") as directory:
        temporary = Path(directory)
        catalog = temporary / "sources.json"
        catalog.write_text(json.dumps([{"name": "alpha", "dataStoreId": "fixture"}]))
        env = {key: value for key, value in os.environ.items() if not key.startswith("HERDR_")}
        env.update(PI_CODING_AGENT_DIR=str(temporary / "agent"), PI_OFFLINE="1",
                   GOOGLE_DATA_STORE_SOURCES_FILE=str(catalog))
        process = await asyncio.create_subprocess_exec(
            "pi", "--mode", "rpc", "--offline", "--no-session", "--no-approve",
            "--no-context-files", "--no-skills", "--no-prompt-templates", "--no-extensions",
            "--extension", str(ROOT / "tests/fixtures/pi-probe.ts"),
            "--tools", "google_data_store_search",
            cwd=directory, env=env, stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stderr = asyncio.create_task(process.stderr.read())
        try:
            process.stdin.write(json.dumps({"id": "smoke", "type": "prompt", "message": "/bootstrap-smoke"}).encode() + b"\n")
            await process.stdin.drain()
            notified = False
            handled = False
            async with asyncio.timeout(30):
                while not (notified and handled):
                    line = await process.stdout.readline()
                    if not line:
                        raise RuntimeError("Pi exited before the probe completed.")
                    record = json.loads(line)
                    if record.get("type") == "extension_error":
                        raise RuntimeError(str(record.get("error", "Extension error")))
                    if record.get("type") == "extension_ui_request" and record.get("message") == "PI_BOOTSTRAP_SMOKE_OK":
                        notified = True
                    if record.get("id") == "smoke" and record.get("type") == "response":
                        if not record.get("success") or record.get("data", {}).get("disposition") != "handled":
                            raise RuntimeError("Pi did not successfully handle the probe command.")
                        handled = True
            process.stdin.close()
            await asyncio.wait_for(process.wait(), 10)
            diagnostics = (await stderr).decode(errors="replace")
            if process.returncode != 0 or diagnostics.strip():
                raise RuntimeError("Pi smoke test returned diagnostics or a nonzero exit.")
            print("Real Pi RPC: search registered, invalid source rejected, no external API call.")
        finally:
            if process.returncode is None:
                process.terminate()
                try:
                    await asyncio.wait_for(process.wait(), 5)
                except TimeoutError:
                    process.kill()
                    await process.wait()
            await stderr


if __name__ == "__main__":
    asyncio.run(smoke())
