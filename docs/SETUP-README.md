# HOW TO USE THESE FILES — Quick Setup Guide (Updated April 14, 2026)

## Your Three Files

You have three files that work together:

1. **`COMPLETE-PH-Home-Services-Platform-Specification.md`** — The business bible (what to build)
2. **`EXPANSION-v2-SDLC-SRS-Infrastructure-Issues.md`** — The technical bible (how to build it)
3. **`AI-CODER-MASTER-INSTRUCTIONS.md`** — The AI coder prompt (instructions for the AI)

## Step-by-Step Setup

### 1. Create Your Repo
```bash
mkdir onservice-onsite-app
cd onservice-onsite-app
git init
```

### 2. Place All Three Files in the Root
```
onservice-onsite-app/
├── COMPLETE-PH-Home-Services-Platform-Specification.md
├── EXPANSION-v2-SDLC-SRS-Infrastructure-Issues.md
├── AI-CODER-MASTER-INSTRUCTIONS.md
```

### 3. For Cursor AI
Rename the instruction file to `.cursorrules` (Cursor reads this automatically):
```bash
cp AI-CODER-MASTER-INSTRUCTIONS.md .cursorrules
```
Cursor will automatically read `.cursorrules` on every prompt and follow those instructions. The specs stay as separate files that `.cursorrules` tells Cursor to reference.

### 4. For Claude Code
Rename the instruction file to `CLAUDE.md` (Claude Code reads this automatically):
```bash
cp AI-CODER-MASTER-INSTRUCTIONS.md CLAUDE.md
```

### 5. For GitHub Copilot
Place the instruction file as `.github/copilot-instructions.md`:
```bash
mkdir -p .github
cp AI-CODER-MASTER-INSTRUCTIONS.md .github/copilot-instructions.md
```

## How to Start Building

Open Cursor (or Claude Code) in the `onservice-onsite-app/` folder, then give your first prompt:

**Your first prompt to the AI coder:**
```
Read the .cursorrules file and both specification markdown files in the repo root.
Confirm you understand the project by summarizing:
1. What we are building
2. The tech stack
3. The build order (which sprint we start with)
4. The absolute rules you must follow

Then set up the project structure exactly as defined in the
.cursorrules file — create all folders, install all dependencies,
configure TypeScript strict mode, set up the monorepo structure,
and create the initial configuration files (theme, platform config,
config files). Do NOT start building screens yet — just the
skeleton and tooling.
```

**After the skeleton is set up, your next prompt:**
```
Now build Sprint 1 (Core Infrastructure) from the SDLC in the
expansion spec. Start with:
1. Database migration files for all core tables (users, providers,
   service_categories, service_subcategories, bookings, wallets,
   wallet_transactions, messages, reviews, disputes, audit_log)
2. The Express server with middleware stack
3. Authentication routes (send-otp, verify-otp, refresh-token)
4. The booking state machine enforcement

Use Philippine test data for all seeds. Follow every rule in .cursorrules.
```

**Then continue sprint by sprint, referencing the spec documents for details on each feature.**

## Important Notes

- The AI coder should NEVER deviate from the spec without asking you first
- The AI coder should ALWAYS use ₱ (PHP), never $ — this is the #1 rule
- Review every piece of code before moving to the next feature
- Run tests after every sprint
- The .cursorrules file tells the AI coder to check the spec documents for every screen it builds
