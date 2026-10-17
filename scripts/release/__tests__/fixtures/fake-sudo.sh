#!/usr/bin/env bash
# TEST DOUBLE for scripts/release/__tests__ only. Stands in for sudo: logs the
# call and runs the rest of the command as the current user. Never install it.
printf 'sudo %s\n' "$*" >> "$FAKE_LOG"
[ "${1:-}" = -n ] || { echo "fake sudo: expected -n first" >&2; exit 90; }
shift
# Real sudo with default sudoers (umask 0022, no umask_override) runs the
# command with the union of the caller's umask and 0022. Model that, and log
# the result, so a test can see which mode files written as root would get.
umask "$(printf '%04o' $(( 0$(umask) | 022 )))"
printf 'sudo-umask %s %s\n' "$(umask)" "$1" >> "$FAKE_LOG"
exec "$@"
