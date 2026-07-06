# pi-yolo

Always-Ask tool execution gate for Pi.

- Read-only tools are auto-approved.
- Mutating tools such as `write`, `edit`, `replace`, `bash`, and custom tools are confirmed before execution when Always-Ask is enabled.
- `/yolo` toggles between `always-ask` and `yolo` modes.
- State is stored at `~/.pi/agent/yolo-state.json`.

## Install

Local development:

```bash
pi install /path/to/pi-yolo
```

GitHub package (from the `pi-bootstrap` monorepo; installs bundled extensions including `pi-yolo`):

```bash
pi install git:github.com/woojung3/pi-bootstrap@v0.2.0
```

npm package:

```bash
pi install npm:pi-yolo@1.1.0
```

## Usage

```text
/yolo
```

When the notification says `YOLO mode: off`, mutating tool calls require confirmation.
