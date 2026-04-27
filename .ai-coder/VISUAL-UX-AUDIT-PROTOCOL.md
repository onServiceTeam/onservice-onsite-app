# THE VISUAL UX AUDIT PROTOCOL

**This is the standard the user-facing surfaces must meet: production work that looks and feels like a $100,000 UX investment, not a prototype, not a toy, not "AI-generated."**

The AI coder reads this before any phase that touches UI. The end-of-phase verifier confirms each user-facing screen has been audited against this standard.

---

## The bar

Every screen must pass this question: **if a paying customer used this for the first time, would they trust the platform with their money and their home?**

Trust signals: clean typography, restrained color, consistent spacing, accurate alignment, sensible motion, no surprise jank, predictable behavior, fast first paint, no spinners that hang, no dead buttons, no "Coming Soon" labels, no Lorem ipsum, no emoji-as-iconography, no broken images, no horizontal scrollbars, no jagged edges, no mismatched font weights.

Anti-trust signals: what makes a UI look "AI-generated" or "prototype-ish":

- Random gradients on every card
- Three icon styles mixed (outline + filled + duotone)
- Inconsistent corner radius (some 4px, some 8px, some 16px on the same screen)
- Buttons in 5 different sizes
- Mismatched font weights on similar elements
- Drop shadows on everything OR nothing
- Stacked emojis as decoration
- "Lorem ipsum" or placeholder copy
- Centered everything (looks like a single-purpose landing page when it's an admin)
- Cards with too much padding making the page feel sparse
- Tables with column widths that don't match data
- Empty states that just say "No data"
- Loading states that are blank instead of skeletons
- Error states that show JSON or stack traces

---

## When to run this protocol

After every UI phase (any phase that touches `apps/admin/src/`, `apps/mobile/app/`, or `apps/mobile/components/`):

1. **During the phase** — informal self-check after every screen-level change (per `CONTINUOUS-SANITY-CHECK.md`)
2. **At end of phase** — formal audit of every screen the phase added or modified, with screenshots committed to `.ai-coder/checkpoints/logs/PHASE-NN/visual/`

---

## The five-pass audit

For every screen the AI coder touched in this phase, perform all five passes. Each pass produces an artifact.

### Pass 1 — Browser validation (literal, not imagined)

**The AI coder MUST actually run the dev server and view the screen in a browser.** Reading the JSX and reasoning is not enough. AI coders in Cursor and Claude Code can use Playwright or built-in browser tools to do this. Use them.

Steps:

```bash
# 1. Start the admin dev server
npm run admin:dev   # Runs on http://localhost:7382

# 2. For mobile, start expo
npm run mobile:start

# 3. Use Playwright to navigate, screenshot, and reason
npx playwright codegen http://localhost:7382  # interactive
# or scripted:
npx playwright test --headed
```

For each screen:

1. Navigate to the screen in a real browser context.
2. Take a screenshot of: loading state, success state, empty state, error state.
3. Take screenshots at viewport widths: 1920, 1440, 1280, 1024, 768, 414, 375.
4. Open the network tab, take a screenshot showing every request, status code, timing.
5. Open the console, take a screenshot. **It must be empty.** Any warning or error is a failure.
6. For mobile screens: use Expo's web preview if available, plus the iOS simulator, plus the Android emulator. Screenshot each.
7. Save all screenshots to `.ai-coder/checkpoints/logs/PHASE-NN/visual/<screen>/`.

**Artifact:** A folder per screen with at minimum: screenshot-loading.png, screenshot-empty.png, screenshot-error.png, screenshot-success.png, screenshot-1920.png, screenshot-1440.png, screenshot-1280.png, screenshot-768.png, screenshot-375.png, console.png, network.png. Plus a `README.md` describing what each shows.

### Pass 2 — The "$100K UX vs toy" reasoning

For each screen, the AI coder writes a reasoning document `quality-reasoning.md` answering:

1. **What is this screen for? In one sentence.** (If you can't, the screen is unfocused.)
2. **What is the most important thing on the screen? Where is the user's eye drawn first?** (If the answer is "everything is the same weight," the visual hierarchy is broken.)
3. **What's the primary action? Is it visually dominant?** (If there are 5 buttons all the same prominence, the user can't tell what to do.)
4. **What does the screen look like to a customer who has never seen this product before?** (Stranger test.)
5. **Could this screen appear in a B-grade competitor's app? In a top-tier competitor's? Why?** (Calibration.)
6. **What three things make this screen look professional?** (Specifics, not "it's clean.")
7. **What three things, if added wrong, would make this screen look like a prototype?** (Active vigilance.)
8. **Is there anything that would make a paying customer hesitate to enter their card details on this page?** (Trust calibration.)

Each answer 2-3 sentences minimum. Vague answers ("it looks good") fail this pass.

### Pass 3 — The pixel pass

Walk every visible element of the screen. Verify against tokens.json:

- **Colors:** every color used is from `--color-*` CSS variables. No hex literals in JSX. No `style={{ color: '#abc' }}`.
- **Spacing:** every margin / padding is a token value (4, 8, 12, 16, 24, 32, 48, 64). No `mt-7` or `p-13` or arbitrary `style={{ padding: 17 }}`.
- **Typography:** every font-size is from the type scale. No inline `text-[15px]`. No `style={{ fontSize: 17 }}`.
- **Radius:** every corner radius is from the token scale. Consistent within element families (all buttons same radius, all cards same radius).
- **Shadows:** consistent shadow scale. Not "every card has a shadow" and not "no card has a shadow." A clear convention.
- **Icons:** all from `lucide-react` (admin) or `lucide-react-native` (mobile). Single weight. Single size per role (header icons one size, body icons another). No emoji.
- **Borders:** consistent border color (`--color-border`), consistent width.

For each violation found: fix it in this phase. Do not leave it.

**Artifact:** `pixel-pass.md` listing every violation found and how it was fixed.

### Pass 4 — The interaction pass

For every interactive element on the screen:

- **Buttons:** click each one. Does it do what its label says? Does it show a loading state? Does it disable while submitting? Does it succeed or error gracefully?
- **Forms:** submit valid data. Submit invalid data field-by-field. Submit empty. Verify error messages are useful, not "Validation failed" but "Phone number must be in +63 9XX XXX XXXX format."
- **Inputs:** tab through every input. Are tab stops in logical order? Is there a focus indicator? Does Enter submit?
- **Selects:** open every select. Are options scrollable? Are long options truncated correctly? Is keyboard nav supported (arrow keys)?
- **Modals:** open. Press Escape (closes?). Click outside (closes?). Tab inside (focus trapped?). Close. (Focus restored to trigger?)
- **Tables:** sort by every sortable column. Filter by every filter. Try with empty data, single row, 100+ rows. Verify pagination works.
- **Date pickers:** pick today. Pick yesterday (rejected if past-date booking). Pick a date 365 days out (allowed?). Pick disabled dates (rejected).
- **Time pickers:** pick a valid time. Pick start > end (rejected).
- **Loading:** observe the loading state appears within 200ms of the action.
- **Error:** force a network error (DevTools → offline). Observe graceful handling, not a stack trace.

For each: confirm or fix.

**Artifact:** `interaction-trace.md` documenting every interaction and result.

### Pass 5 — The flow pass

Look at the screen in context of the user's journey:

- **How many clicks** to get from app open to this screen?
- **How many fields** does the user fill before they can take their primary action?
- **How many screens** does the user pass through to complete the task this screen is part of?
- **Could any of these be reduced** without losing information?

Specifically: a customer should be able to **book a service in 4 screens or fewer** (location → service → time → confirm). A provider should be able to **accept a booking in 2 taps** (notification → accept). An admin should be able to **see actionable alerts on the dashboard without clicking deeper** unless they need details.

If the current flow exceeds these targets without justification: redesign or escalate.

**Artifact:** `flow-analysis.md` with click count, field count, and any redesign recommendations.

---

## The cross-platform matrix

For mobile screens, every audit must also confirm:

| Platform | What to verify | Tool |
|---|---|---|
| iOS Simulator | Looks correct on iPhone 14 Pro (393×852), iPhone SE (375×667) | Xcode simulator + screenshot |
| Android Emulator | Looks correct on Pixel 6 (411×891), small phone (360×640) | Android Studio emulator |
| Tablet | iPad / large Android tablet (768×1024 minimum) | Simulator |
| Web preview (Expo web) | Functional and accessible | Browser |

For admin screens:

| Platform | What to verify | Tool |
|---|---|---|
| Chrome | Latest stable | Browser |
| Safari | Latest stable | Safari (or webkit via Playwright) |
| Firefox | Latest stable | Firefox |
| Mobile Chrome / Safari (responsive) | Admin must be functional on a tablet for field staff | DevTools device toolbar |

For each platform: take a screenshot. Verify the screen still looks $100K not toy.

---

## The visual regression check

After this phase's screens look right, run the regression check on screens this phase did NOT touch:

1. Screenshot 5 random pre-existing screens.
2. Compare to baseline (taken before phase started).
3. Any change is a regression. Investigate.

If a phase changes a CSS variable or a shared component, every screen using that variable / component must be re-audited.

---

## What "looks AI-generated" looks like (and how to fix it)

A non-exhaustive list of red flags AI coders introduce by default:

| Symptom | Fix |
|---|---|
| Every card has a gradient background | Use solid `--color-surface`. Reserve gradients for hero / marketing pages only. |
| Every section title is centered | Left-align in admin and forms. Center sparingly (titles of empty states only). |
| Buttons have rounded-full radius | Use `--radius-md` (8px) for primary buttons. `rounded-full` for badges only. |
| Drop shadow on every element | Use shadow only for elevation: modals, popovers, sticky headers. |
| Mixed icon styles (some lucide, some emoji, some heroicons) | Single library: lucide. Audit removes any others. |
| 5 grays in use (text-gray-300, 400, 500, 600, 700, 900) | Use semantic tokens: `--color-text`, `--color-text-secondary`, `--color-text-muted`. Three grays max. |
| Disabled buttons with full opacity | Disabled = `opacity: 50%` plus `cursor-not-allowed` plus reduced contrast. |
| Loading = giant centered spinner | Use skeleton screens that mirror the page layout. Spinners only for short waits (<2s) inline with the affected element. |
| Empty state = "No data found." | Empty state = an illustration or icon + a one-sentence explanation + a primary call to action ("Book your first job"). |
| Error state = stack trace | Error state = a one-sentence explanation + a primary action ("Try again") + an option to contact support. |
| Form errors = generic "Invalid input" | Form errors = specific, actionable. "Phone number must be in +63 9XX XXX XXXX format." |
| Cards with no visual hierarchy | Use scale: title > subtitle > body. One bold per card. |
| Headers competing with content | Headers use `--color-text` 80% weight, content uses 100%. Or use size differential. |
| Excessive whitespace making page feel sparse | Reduce vertical padding on cards by 8-16px. Tighten gaps between sections. |

---

## How the AI coder must reason — actually using the eye

The hardest part of this protocol: the AI coder must look at screenshots and reason about quality, not just check boxes.

After taking screenshots, the AI coder writes (in `quality-reasoning.md`):

> "Looking at the screenshot for the dashboard at 1440px width: the eye is drawn to the top-left KPI card because it has the highest contrast text. The 'Today's Revenue' value is the most important number on the page and IS in this top-left position — that's correct. However, I notice the chart on the right uses a gradient that doesn't appear elsewhere on the page; it looks decorative rather than functional. I will remove the gradient and use a solid bar fill that matches `--color-primary`. Second observation: the alert feed below has 3 different status colors (red, yellow, blue) but no legend; a first-time admin won't know what they mean. I will add tooltips on hover and an inline legend at the top of the feed."

This is the kind of reasoning that separates $100K UX from prototype UX. If the AI coder is producing only "looks good" or "all checks pass" without specific observations like the above, it's skipping this protocol.

---

## End-of-phase visual report

For every UI phase, the final artifact is `.ai-coder/checkpoints/logs/PHASE-NN/visual/REPORT.md`:

```markdown
# Visual Audit Report — Phase NN

## Screens audited
1. /admin/dashboard
2. /admin/providers/[id]
3. (mobile) customer/booking-confirm

For each screen:

### /admin/dashboard

**Pass 1 (Browser):** screenshots at 1920/1440/1280/768/375; console clean; network clean. → ./dashboard/
**Pass 2 ($100K vs toy):** see ./dashboard/quality-reasoning.md. Calibrated as: top-tier competitor parity with caveats.
**Pass 3 (Pixel):** 4 violations found and fixed. See ./dashboard/pixel-pass.md.
**Pass 4 (Interaction):** All 8 interactive elements traced. See ./dashboard/interaction-trace.md.
**Pass 5 (Flow):** Dashboard appears in 1 click from login. KPIs visible without scroll. See ./dashboard/flow-analysis.md.

(repeat for every screen)

## Cross-platform
- iOS Simulator (iPhone 14 Pro): ✓
- Android Emulator (Pixel 6): ✓
- iPad: ✓
- Chrome: ✓
- Safari: ✓
- Firefox: ✓

## Visual regressions
- 5 untouched screens screenshotted and compared to baseline. Zero regressions detected.

## Calibration question
At the end of this phase, would I be embarrassed to demo these screens to a paying customer? **No.**
Would I be proud to demo these screens? **(Yes / Mostly yes, with caveats / No.)**
What would make me prouder next phase? **(Specifics.)**
```

The verify-master.sh script confirms `visual/REPORT.md` exists and references at least N screens proportional to the phase's UI scope.

---

## What this protocol does NOT do

- It does not replace user research with real customers (a separate workstream).
- It does not guarantee zero bugs (no protocol does).
- It does not optimize for SEO or marketing performance (Phase 12 covers this).

What it DOES do: it forces the AI coder to actually look at the work in a browser, reason about quality with specifics, and produce evidence Ken can spot-check.

---

## A reminder

A $100K UX is not magic. It is what you get when every visible element was placed deliberately, every color is from a system, every interaction has loading and error states, every screen makes the user's next move obvious. There are no shortcuts. There are no AI templates that look like this.

The AI coder gets to $100K UX by **doing the slow, careful work, every screen, every phase**. The protocol above is how the AI coder is forced to do that work and produce evidence of having done it.

If the AI coder skips this protocol, the screens will look like they were generated, and you will know it on sight, and so will every customer.
