#!/usr/bin/env python3
"""Apply Codemode-on / bundled Data Store search-off defaults, preserving other settings."""
import json
import os
import re
from pathlib import Path
import tempfile


def enable_codemode(settings):
    if not isinstance(settings, dict):
        raise ValueError("Pi settings must be an object")
    tools = settings.get("defaultTools", [])
    if not isinstance(tools, list) or not all(isinstance(t, str) and t for t in tools):
        raise ValueError("defaultTools must be a list of nonempty strings")
    # An explicit empty list disables defaults; preserve that selection.
    replacement = "defaultTools" in settings and (
        not tools or any(not t.startswith(("+", "-")) for t in tools)
    )
    merged = [t for t in tools if t not in ("codemode", "+codemode", "-codemode")]
    merged.append("codemode" if replacement else "+codemode")
    return {**settings, "defaultTools": merged}


SEARCH_EXCLUSION = "-extensions/google-data-store-search/index.ts"


def disable_bundled_search(settings):
    # Only migrate this bootstrap's Git package. Unrelated packages and explicit
    # extension paths are the user's choices and are left untouched.
    packages = settings.get("packages")
    if packages is None:
        return settings
    if not isinstance(packages, list):
        raise ValueError("packages must be a list")
    merged = []
    for entry in packages:
        source = entry if isinstance(entry, str) else entry.get("source") if isinstance(entry, dict) else None
        if not isinstance(source, str):
            raise ValueError("package source must be a string")
        owned = re.fullmatch(r"(?:git:)?(?:https://)?github\.com/woojung3/pi-bootstrap(?:\.git)?(?:@[^\s]+)?", source)
        if not owned:
            merged.append(entry)
            continue
        item = {"source": entry} if isinstance(entry, str) else dict(entry)
        patterns = item.get("extensions")
        if patterns is not None and (not isinstance(patterns, list) or not all(isinstance(p, str) for p in patterns)):
            raise ValueError("package extensions must be a list of strings")
        # [] means all disabled. Adding an exclusion to it would enable other extensions.
        if patterns != []:
            item["extensions"] = list(patterns or [])
            if SEARCH_EXCLUSION not in item["extensions"]:
                item["extensions"].append(SEARCH_EXCLUSION)
        merged.append(item)
    return {**settings, "packages": merged}


def install(agent):
    path = agent / "settings.json"
    if path.is_symlink():
        raise ValueError("Refusing to replace a symlinked settings.json")
    old = path.read_bytes() if path.exists() else None
    settings = json.loads(old) if old is not None else {}
    updated = disable_bundled_search(enable_codemode(settings))
    if "-builtin:codemode" in settings.get("extensions", []):
        raise ValueError("builtin:codemode is disabled; review extensions first")
    if updated == settings:
        return False
    agent.mkdir(parents=True, exist_ok=True)
    if old is not None:
        backups = agent / "backups"
        backups.mkdir(mode=0o700, exist_ok=True)
        backups.chmod(0o700)
        fd, backup = tempfile.mkstemp(prefix="tools-settings-", suffix=".json", dir=backups)
        with os.fdopen(fd, "wb") as stream:
            stream.write(old)
    fd, tmp = tempfile.mkstemp(prefix=".settings-", dir=agent)
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(updated, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    return True


if __name__ == "__main__":
    agent = Path(os.environ.get("PI_CODING_AGENT_DIR", str(Path.home() / ".pi/agent")))
    if not agent.is_absolute():
        raise SystemExit("PI_CODING_AGENT_DIR must be an absolute path")
    try:
        changed = install(agent)
    except (ValueError, OSError) as exc:
        raise SystemExit(f"Cannot apply Pi defaults ({type(exc).__name__}); check settings and permissions") from None
    print("Pi defaults applied: Codemode on, bundled Data Store search off; reload Pi." if changed else "Pi defaults already applied.")
