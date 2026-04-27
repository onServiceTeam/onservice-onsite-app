# START HERE

You're looking at the onService PH AI coder execution package, version FINAL-AUDITED.

This package was rebuilt after a real audit against your actual repo at https://github.com/onServiceTeam/onservice-onsite-app.git (commit 322330a). The earlier version had hallucinated paths (`/frozen/`), wrong dependency lists (forbade zustand which you actually use), and didn't integrate with the 9 substantial spec docs already in your repo. All of that is fixed in this version. The audit is in `PACKAGE-AUDIT-FIXES.md`.

---

## What this package gives you

A complete, audit-ready execution plan with these defenses against AI coder laziness:

1. **Continuous sanity check** — after every meaningful change, the AI coder runs your specific 3-tier audit (sanity, integrity, regression). Logs are required and proportional to diff size.

2. **The 463-check master QA system** — at end of every phase, the AI coder produces evidence for every applicable check.

3. **Visual UX audit with browser validation** — the AI coder must use Playwright / browser tools to actually view screens, take screenshots, reason about quality at the "$100K UX vs toy" level. Required for every UI phase.

4. **Autonomous execution** — phase 00 → 12 runs without your gate. The AI coder self-confirms each phase and proceeds. Stops only on 5 specific hard-stop conditions. You audit at your pace.

5. **Cryptographic evidence chain** — every artifact SHA-256 hashed and committed. Tamper-detection without your needing to read code.

6. **Integration with your existing repo docs** — the 9 spec docs already in your repo (COMPLETE-PH, EXPANSION-v2, COMPREHENSIVE-271, RUNTIME-CONFIG, .cursorrules, etc.) remain authoritative for product WHAT. The new `.ai-coder/` governance is authoritative for execution HOW.

---

## What changed from the previous version (and why you should believe this one)

In `PACKAGE-AUDIT-FIXES.md`, every error from the previous version is documented:

- **3 hallucinated `/frozen/` references** removed
- **Dependency list rewritten** from your actual `package.json` files (zustand, bullmq, react-native-mmkv, react-native-maps, expo-router, etc. now correctly approved instead of forbidden)
- **Real npm scripts** used everywhere (`migrate:up --workspace=packages/api`, not made-up `db:reset`)
- **Real test file names** in verify-money-conservation.sh (escrow-money-conservation, dispute-refund-processing, wallet-type-isolation, booking-state-machine — verified to exist)
- **node-pg-migrate** used in verify-migrations.sh (your actual migrator, not a made-up one)
- **Existing repo docs** added to required reading list (the AI coder reads your 9 spec docs, not just my new ones)
- **Visual UX audit protocol** added — the missing layer for "does this look like $100K UX or a prototype"
- **Autonomous execution protocol** added — phase-to-phase auto-proceed, no Ken-gating

---

## How to use this package

### 1. Install into your repo

You're on Windows 11 with the repo at `C:\Users\<you>\GitHub\onservice-onsite-app\`.

In Git Bash or PowerShell:

```bash
cd ~/GitHub/onservice-onsite-app
# Extract the zip into the repo root.
# After extraction, the new files sit alongside your existing files.
# Your existing .cursorrules, COMPLETE-PH-..., EXPANSION-v2-... etc are NOT touched.
```

Commit on a new branch:

```bash
git checkout -b feat/install-ai-coder-execution-package
git add -A
git commit -m "chore: install AI coder execution package (audited against actual repo)"
git push -u origin feat/install-ai-coder-execution-package
```

You can merge to main later or keep it on the branch — either works.

### 2. Read these three docs yourself first (~30 minutes total)

- `PACKAGE-AUDIT-FIXES.md` — what was wrong before and what's fixed now
- `REPO-INTEGRATION.md` — how this package coexists with your existing 9 repo docs
- `STRATEGY.md` — city, scope, multi-service decisions (carries over from earlier package — check it still matches your thinking)

### 3. Open Cursor / Claude Code in the repo

Start a fresh chat. Paste the entire contents of `AI-CODER-PROMPT.md` as the first message.

The AI coder will read all 21 required documents and reply with a specific confirmation message. It then waits.

### 4. Authorize Phase 00

Reply: **"begin Phase 00"**

From this moment, the AI coder runs **autonomously**. It executes phase 00, self-verifies, and immediately starts phase 01. It only stops on the 5 hard-stop conditions defined in `.ai-coder/AUTONOMOUS-EXECUTION-PROTOCOL.md`:

1. verify-master.sh fails 3 times in a row
2. Architectural decision required
3. Money or compliance risk
4. Production data risk
5. Spec contradiction with existing docs

Per phase, you get one short status message ("Phase NN complete & verified, executing NN+1"). You can ignore. Or you can audit at your pace.

### 5. Audit at your pace (whenever you want)

When you have time, pick any phase and run:

```bash
# Re-verify the phase
bash .ai-coder/checkpoints/verify-master.sh PHASE-NN

# Read what happened
cat .ai-coder/checkpoints/logs/PHASE-NN/EVIDENCE-MANIFEST.md
cat .ai-coder/checkpoints/logs/PHASE-NN/HONESTY-CHECK.md

# For UI phases, view the screenshots
open .ai-coder/checkpoints/logs/PHASE-NN/visual/

# Verify the cryptographic hash chain
cd .ai-coder/checkpoints/logs/PHASE-NN
sha256sum -c HASHES.sha256
cd -
```

If you find an issue, message the AI coder. It stops at the next clean checkpoint, fixes, continues.

---

## Realistic expectations

**Per-phase AI coder work:** 1-30 hours depending on phase scope (Phase 00 ~1h, Phase 09 ~30h)
**Total AI coder work:** ~110 hours across 13 phases
**Your involvement:** zero between phases (autonomous), occasional spot-audit when you want
**Calendar time:** 4-12 weeks depending on AI coder speed and any blockers

Outcome: a production-ready, multi-city, multi-service home services platform with code, admin panel, and mobile apps that look like a $100K UX investment, with full BIR / NPC / DTI compliance and audit trail.

---

## What this package does NOT do

- It cannot guarantee zero bugs (no system can)
- It cannot replace the BIR accountant or NPC DPO you'll eventually need
- It cannot replace customer research and real launches
- It cannot make the AI coder smarter — it can only force it to be honest about what it actually did

What it CAN do: every claim the AI coder makes is backed by an artifact you can verify. Every check is mechanical. Every visual is a real screenshot. The AI coder cannot fake an artifact that doesn't exist.

---

## When something goes wrong

The AI coder is trained to escalate, not improvise. If it gets stuck, it sends you a focused message with: what's failing, what it tried, what it thinks is needed. You decide.

If you ever lose confidence in the system, run this:

```bash
# Re-run the full chain on the latest phase
bash .ai-coder/checkpoints/verify-master.sh PHASE-NN

# Check if any artifact was tampered with
cd .ai-coder/checkpoints/logs/PHASE-NN
sha256sum -c HASHES.sha256
```

If the hash chain shows tamper or verify-master fails, you've caught the AI coder. Revert the phase, restart it, demand a constitutional Truth-Telling violation entry in `.ai-coder/checkpoints/violations.log`.

---

## The shortest version

1. Extract this package into your repo root, commit
2. Read PACKAGE-AUDIT-FIXES.md, REPO-INTEGRATION.md, STRATEGY.md (30 min)
3. Open Cursor, paste AI-CODER-PROMPT.md, say "begin Phase 00"
4. Let it run autonomously to Phase 12
5. Spot-audit any phase you want, anytime, with `verify-master.sh PHASE-NN`

You do not gate phases. You do not approve transitions. You audit at your pace using the evidence chain. The AI coder runs end-to-end on its own discipline and your script-based verification.

That's how this works.
