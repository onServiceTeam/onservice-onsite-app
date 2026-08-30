# E32 - Production SSH authorization rejects the supplied identities

**Date:** 2026-08-30
**Status:** OPEN
**Hard stop:** production synchronization and post-deploy verification

## Finding

The current production target is `46.62.207.225`. Read-only SSH probes offered each supplied local private identity and the available SSH-agent/default identities to the expected deployment accounts. The server rejected every attempt with `Permission denied (publickey)`.

No production file, service, database, container, or repository state was changed. The older server address was not used.

The GitHub deployment workflow is not a fallback at this time because its required deployment host, user, and key secrets are absent.

## Required external action

Authorize the intended deployment public key for the correct production account, or provide the exact currently authorized account/key pair through a private channel. Do not commit server credentials or key locations to this public repository.

## Work paused

Production fast-forward, backup, build, service recreation, hash comparison, nginx validation, and live browser verification remain paused. Local verification and GitHub synchronization may continue.
