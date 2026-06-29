#!/usr/bin/env bash
# Restore the dedicated server SSH key from the Codespaces secret SSH_PRIVATE_KEY.
# Runs on Codespace start so server access survives rebuilds. No-op if unset.
set -euo pipefail

KEY="$HOME/.ssh/onservice_hetzner"
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

if [ -n "${SSH_PRIVATE_KEY:-}" ]; then
  printf '%s\n' "$SSH_PRIVATE_KEY" > "$KEY"
  chmod 600 "$KEY"
  echo "restore-ssh: wrote $KEY"
else
  echo "restore-ssh: SSH_PRIVATE_KEY not set, skipping"
fi
