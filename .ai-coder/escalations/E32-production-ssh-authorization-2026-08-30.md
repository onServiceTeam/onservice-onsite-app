# E32 - Production SSH authorization rejects the supplied identities

**Date:** 2026-08-30
**Status:** RESOLVED for SSH authentication, 2026-09-05. Deployment verification remains separate.
**Former hard stop:** production synchronization and post-deploy verification

## Resolution, 2026-09-05

The already-authorized dedicated identity documented in private local SSH
notes succeeds. Read-only checks verified the marketplace origin, both path
aliases resolving to `/opt/onservice`, and the live checkout at `7ed367cd`.
Do not publish credential contents or private key locations. No new key
installation or server authorization change was needed.

The current release and recovery evidence is in
`docs/audits/AUTONOMOUS-RESUMPTION-2026-09-05.md`. Authentication is no longer
a reason to pause synchronization work. Successful backup/migration rehearsal,
release checks and bounded rollout still must precede a live update.

The original failed-probe record below is retained as history, not current state.

## Finding

The current production target is `46.62.207.225`. Read-only SSH probes offered each supplied local private identity and the available SSH-agent/default identities to the expected deployment accounts. The server rejected every attempt with `Permission denied (publickey)`.

No production file, service, database, container, or repository state was changed. The older server address was not used.

The GitHub deployment workflow is not a fallback at this time because its required deployment host, user, and key secrets are absent.

## Required external action

Authorize the intended deployment public key for the correct production account, or provide the exact currently authorized account/key pair through a private channel. Do not commit server credentials or key locations to this public repository.

## Work paused

Production fast-forward, backup, build, service recreation, hash comparison, nginx validation, and live browser verification remain paused. Local verification and GitHub synchronization may continue.
