# INTEGRATION WITH EXISTING REPO DOCS

The repo at https://github.com/onServiceTeam/onservice-onsite-app.git already contains substantial governance and specification documents. This package does NOT replace them. It supplements them with execution discipline.

---

## What's already in your repo (and stays)

| Document | Size | Authority for |
|---|---|---|
| `.cursorrules` (== `CLAUDE.md` == `AI-CODER-MASTER-INSTRUCTIONS.md`) | 34KB | Existing AI coder rules — Philippine localization, no hardcoded values, TypeScript strict mode, etc. |
| `COMPLETE-PH-Home-Services-Platform-Specification.md` | 122KB | Business model, monetization, all user stories, screen-by-screen UI/UX, dispute system, payment architecture |
| `EXPANSION-v2-SDLC-SRS-Infrastructure-Issues.md` | 46KB | SDLC, FRs (FR-001 to FR-153), NFRs, infrastructure scaling, screen component trees |
| `COMPREHENSIVE-271-ISSUE-AUDIT.md` | 39KB | The 271-issue audit — what's actually broken now |
| `RUNTIME-CONFIG-SYSTEM-SPEC.md` | 39KB | Runtime config: commission rates, fees, settings stored in DB |
| `CODE-AUDIT-AND-FIX-INSTRUCTIONS.md` | 53KB | Existing audit and fix instructions |
| `SETUP-README.md` | 3KB | Setup |
| `README.md` | 2KB | Repo readme |

These remain authoritative. The AI coder reads them. The product specs in particular (COMPLETE, EXPANSION-v2, RUNTIME-CONFIG) are the source of truth for WHAT to build.

## What this package adds (and takes authority for)

| New document | Authority for |
|---|---|
| `.ai-coder/CONSTITUTION.md` | HOW the AI coder behaves (truth-telling, code quality, escalation) |
| `.ai-coder/DEFINITION-OF-DONE.md` | When a phase is "done" |
| `.ai-coder/CONTINUOUS-SANITY-CHECK.md` | The after-every-change ritual |
| `.ai-coder/MASTER-QA-SYSTEM.md` | The 463 explicit checks |
| `.ai-coder/100-PERCENT-ACCURACY-PROTOCOL.md` | The 6 verification gates |
| `.ai-coder/VISUAL-UX-AUDIT-PROTOCOL.md` | The $100K UX standard with browser validation |
| `.ai-coder/AUTONOMOUS-EXECUTION-PROTOCOL.md` | When to auto-proceed vs stop |
| `.ai-coder/SELF-VERIFICATION-PROTOCOL.md` | Failure pattern catalog |
| `.ai-coder/ESCALATION-PROTOCOL.md` | When to ask Ken |
| `.ai-coder/checkpoints/*.sh` | Mechanical verification scripts |
| `.ai-coder/phases/*.md` | The 13-phase execution plan |
| `STRATEGY.md` | City and scope decisions |
| `ADMIN-SPEC.md` | Commercial-grade admin panel spec (supplements COMPLETE-PH spec) |
| `MOBILE-SPEC.md` | Mobile screens supplement |
| `DESIGN-CONTRACT.md` | Visual identity locked |
| `MARKETING-PLAYBOOK.md` | PH-specific marketing |
| `COMPLIANCE.md` | BIR / NPC / DTI checklist |
| `INSURANCE.md` | SiguradoShield architecture |

## Conflict resolution rules

When the existing repo docs and the new package docs conflict:

1. **Product-WHAT decisions** (commission rates, user stories, dispute flow, payment architecture, regulatory requirements, business model): the existing spec docs win. The new package execution plan implements those specs.

2. **Process-HOW decisions** (verification rigor, evidence requirements, when to escalate, what counts as "done"): the new `.ai-coder/` package wins. It supersedes the looser process language in the existing `.cursorrules`.

3. **Iconography and design system specifics**: the new `DESIGN-CONTRACT.md` and Phase 01/02 supersede generic guidance in existing docs.

4. **Specific dependency choices** (zustand for state, shadcn for components, lucide for icons): new package tracks the real installed deps in `verify-deps.sh`. Where existing docs and new package disagree on what's installed, **the actual `package.json` files in the repo win.**

5. **If a real conflict cannot be resolved by these rules**: the AI coder STOPS, writes an escalation, asks Ken which is correct, and updates whichever doc is wrong.

---

## What the AI coder reads (and in what order)

For any phase, before starting work:

1. The phase doc in `.ai-coder/phases/PHASE-NN-*.md`
2. The relevant section of `COMPLETE-PH-Home-Services-Platform-Specification.md` (the product WHAT)
3. The relevant section of `EXPANSION-v2-SDLC-SRS-Infrastructure-Issues.md` (the SDLC + screen specs)
4. The relevant section of `COMPREHENSIVE-271-ISSUE-AUDIT.md` (current bugs)
5. `RUNTIME-CONFIG-SYSTEM-SPEC.md` (config values — commission, fees, etc.)
6. `.ai-coder/CONSTITUTION.md` (rules)
7. `.ai-coder/CONTINUOUS-SANITY-CHECK.md` (after-every-change ritual)
8. `.ai-coder/VISUAL-UX-AUDIT-PROTOCOL.md` (if UI phase)
9. `.ai-coder/AUTONOMOUS-EXECUTION-PROTOCOL.md` (when to proceed vs stop)

The first time the AI coder is invoked, it must read the entire constitution and DOD. Subsequent phases can do focused reads.

---

## What this means for Ken

You don't need to delete or modify any existing repo doc. The new package goes alongside them and the AI coder reads both.

The new package's primary value-add is:

- **Mechanical verification** — scripts that prove claims rather than trusting them
- **Continuous sanity check** — the after-every-change ritual
- **Visual UX audit** — the $100K standard with browser validation
- **Autonomous execution** — Ken doesn't gate every phase
- **Cryptographic evidence chain** — tamper detection on artifacts
- **Phase-by-phase plan** — so the AI coder knows what to do next

Everything else (the product spec, the FRs, the regulations, the runtime config) is already in your repo and stays there.
