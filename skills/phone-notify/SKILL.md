---
name: phone-notify
description: Send explicitly requested commands, shell scripts, URLs, or notes to the user's Android phone through the host's existing ntfy topic. Use when the user says “폰으로 보내줘”, “ntfy로 보내줘”, or asks to send text to their phone for copying. Not for automatic completion notifications.
---

# Send text to the phone

Use only when the user explicitly requests sending specific content to their phone.
If the content is ambiguous, ask what to send. Sending does not execute the content.

## Requirements

Select the route before sending; do not identify the host by its hostname.
Use local execution only when both executables and the configuration exist:

```sh
test -x "$HOME/.local/bin/host-notify" &&
  test -x "$HOME/.local/bin/host-secrets" &&
  test -f "$HOME/.config/herdr-notifier/config.json"
```

Check existence only; do not read credentials or configuration contents.
If this check fails, use SSH to `jwlee@minipc`. The user manages name resolution,
SSH authentication and access policy. Use `-T` (no pseudo-terminal),
`BatchMode=yes` and `StrictHostKeyChecking=yes`; never bypass host verification,
change SSH settings or install credentials. If SSH is unavailable or access fails,
report the prerequisite and stop.

The sender on minipc owns the endpoint, `herdr` topic and scoped authentication.
Do not install services, print secret environments, invent a public endpoint,
add a topic, change phone settings or copy credentials to another machine.
Never switch routes after a send attempt: an error may still mean delivery.

## Content and safety

- Send only the requested text. A shell script is message content, never a command
  to execute on the host or phone.
- Preserve internal whitespace, indentation, newlines, quotes and literal backslashes.
  Do not add Markdown fences, commentary, host labels or line numbers to the body.
  ntfy removes outer whitespace: the sender explicitly removes boundary CR/LF and
  warns, but refuses leading/trailing spaces or tabs rather than silently changing
  indentation. Use `--attach` for byte-for-byte file transfer; attachments preserve
  all original bytes, including boundary whitespace.
- Inspect the intended content before sending. Do not transmit private keys,
  passwords, tokens, `.env`/credential files, or secret-loader output. If unsure,
  stop and ask; offer a redacted version only with the user's approval.
- Notifications may appear on the lock screen and be cached by ntfy. Do not send
  confidential work content without confirming it is intended for this channel.
- The body limit is 4096 UTF-8 bytes, not characters. Larger reviewed text is
  automatically uploaded as `message.txt` to the same ntfy server, without
  normalization or truncation. Tell the user it was accepted as an attachment,
  not a copyable notification body. Never split or upload elsewhere.
- Attachments expire according to server policy (configured for 24 hours where
  supported); do not promise permanent storage or exact deletion timing.

## Local send

Use these commands only when the local environment check succeeds.
For an existing reviewed UTF-8 file:

```sh
"$HOME/.local/bin/host-notify" --title '스크립트' --body '/absolute/path/to/script.sh'
```

For an explicitly requested, reviewed file attachment:

```sh
"$HOME/.local/bin/host-notify" --title '파일' --attach '/absolute/path/to/file.txt'
```

`--body` may accompany `--attach` as a UTF-8 caption file (at most 4096 bytes).
Without a caption, `--attach` does not read stdin. `--attach -` reads file bytes
from stdin; body and attachment cannot both use stdin.

For a short literal message, use stdin with a quoted heredoc and a delimiter that
is not a line in the content (the heredoc includes a final newline):

```sh
"$HOME/.local/bin/host-notify" --title '명령어' <<'PHONE_TEXT_END'
REPLACE_WITH_THE_USER_REQUESTED_LITERAL_TEXT
PHONE_TEXT_END
```

## SSH send

Redirect the reviewed local file into SSH; its path is not a path on minipc.
No `scp` upload or remote temporary file is needed.

```sh
# UTF-8 body; over 4096 bytes becomes message.txt automatically.
ssh -T -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 jwlee@minipc \
  '~/.local/bin/host-notify --title "스크립트" --body -' < '/absolute/path/to/script.sh'

# Exact file bytes; stdin attachments are named attachment.bin.
ssh -T -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 jwlee@minipc \
  '~/.local/bin/host-notify --title "파일" --attach -' < '/absolute/path/to/file.txt'
```

For literal text, use the same SSH body command with the quoted heredoc shown
above instead of file redirection. Never use `ssh -n`, which discards stdin.
Keep the remote command fixed; do not interpolate content, filenames or arbitrary
titles into it. SSH attachments preserve bytes, but not the source filename.
Do not claim filename preservation or send a local caption path to minipc.
Body and attachment cannot share stdin; these SSH examples send one or the other.

If the source file is on another SSH server, first retrieve it successfully into
a private local temporary file using approved access, inspect it, then send it
through the selected route and remove the temporary file. Do not pipe a remote
reader directly into the sender: a failed read can otherwise publish partial data.

## Delivery

Never interpolate content into an unquoted shell command or use `eval`. Prefer
`--body` or `--attach` to avoid shell expansion. Use a short, non-sensitive title
such as `명령어`, `스크립트`, or `메모`.

For inline text the sender uses normal JSON publishing, never ntfy templates
(which expand literal `\\n`), and verifies the response matches the body after
boundary-line normalization. Files use binary uploads, with attachment metadata
checked in the response (not a download/hash verification). The Android app
already copies the body when this user taps a notification; add no copy actions.

On success say only that ntfy accepted the text or attachment; phone receipt and clipboard
fidelity require the user's confirmation. On errors/timeouts delivery may be
uncertain: do not automatically resend and create duplicates. Do not expose raw
HTTP responses, credentials, or secret-loader diagnostics.
