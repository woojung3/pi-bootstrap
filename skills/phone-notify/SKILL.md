---
name: phone-notify
description: Send explicitly requested commands, shell scripts, URLs, or notes to the user's Android phone through the host's existing ntfy topic. Use when the user says “폰으로 보내줘”, “ntfy로 보내줘”, or asks to send text to their phone for copying. Not for automatic completion notifications.
---

# Send text to the phone

Use only when the user explicitly requests sending specific content to their phone.
If the content is ambiguous, ask what to send. Sending does not execute the content.

## Requirements

Check `command -v host-notify`. If absent, check whether the executable exists at
`$HOME/.local/bin/host-notify`. If neither exists, explain that this host needs the
`dotfiles-firebat-t8-plus` notification sender configured. Do not install services,
read credentials, print secret environments, or invent a public ntfy endpoint.

The host tool owns the endpoint, existing `herdr` topic, and scoped authentication.
Do not add a topic, change phone settings, or duplicate credentials in this package.

## Content and safety

- Send only the requested text. A shell script is message content, never a command
  to execute on the host or phone.
- Preserve internal whitespace, indentation, newlines, quotes and literal backslashes.
  Do not add Markdown fences, commentary, host labels or line numbers to the body.
  ntfy removes outer whitespace: the sender explicitly removes boundary CR/LF and
  warns, but refuses leading/trailing spaces or tabs rather than silently changing
  indentation. Explain this limitation when byte-for-byte file transfer is requested.
- Inspect the intended content before sending. Do not transmit private keys,
  passwords, tokens, `.env`/credential files, or secret-loader output. If unsure,
  stop and ask; offer a redacted version only with the user's approval.
- Notifications may appear on the lock screen and be cached by ntfy. Do not send
  confidential work content without confirming it is intended for this channel.
- The body limit is 4096 UTF-8 bytes, not characters. If larger, report the limit
  and ask for a smaller selection. Never silently truncate, split, attach, or
  upload elsewhere.

## Send

For an existing reviewed UTF-8 file:

```sh
host-notify --title '스크립트' --file '/absolute/path/to/script.sh'
```

For a short literal message, use stdin with a quoted heredoc and a delimiter that
is not a line in the content (the heredoc includes a final newline):

```sh
host-notify --title '명령어' <<'PHONE_TEXT_END'
REPLACE_WITH_THE_USER_REQUESTED_LITERAL_TEXT
PHONE_TEXT_END
```

Never interpolate content into an unquoted shell command or use `eval`. Prefer
`--file` to avoid shell expansion. Boundary line endings are excluded as noted above. Use a short
non-sensitive title such as `명령어`, `스크립트`, or `메모`.

The sender uses normal JSON publishing, never ntfy templates (which expand literal
`\\n`), and verifies the response matches the body after boundary-line normalization. The Android app
already copies the body when this user taps a notification; add no copy actions.

On success say only that ntfy accepted the text; phone receipt and clipboard
fidelity require the user's confirmation. On errors/timeouts delivery may be
uncertain: do not automatically resend and create duplicates. Do not expose raw
HTTP responses, credentials, or secret-loader diagnostics.
