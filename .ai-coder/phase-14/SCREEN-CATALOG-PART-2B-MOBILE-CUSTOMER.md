# SCREEN CATALOG — Mobile Customer (Part 2B of 3)

**This catalog covers the ~50 mobile customer screens.** Same template as Part 2A. Audiences:

1. **The AI coder** — verifies "did I build this screen correctly?" Acceptance criteria become test assertions and Maestro flow steps.
2. **A UX firm engaged later** — uses this as the build brief for redesigning the customer mobile app in Figma.
3. **Ken** — verifies, by tapping through each screen on a real iPhone and Android, whether what he sees matches what's written here.

**Scope:** files under `apps/mobile/app/auth/*`, `apps/mobile/app/(tabs)/*`, `apps/mobile/app/customer/*`, plus root-level `apps/mobile/app/index.tsx` and `apps/mobile/app/onboarding.tsx`. **Provider screens are in Part 2C.**

**Cross-cutting requirements that apply to every customer screen — not repeated per page:**
- 100% lucide icons via `@/components/icons`. Zero emoji as iconography (Constitution Article 4.6). The accessibility labels file `apps/mobile/src/config/accessibility.ts:56-63` currently has emoji `statusIndicators` which must be replaced with semantic labels.
- All text uses Inter (system fallback `San Francisco` / `Roboto`). Type scale per Design Contract V2 §3.
- Background `#FAFAFA`, surface `#FFFFFF`, brand primary `#1B3A4B` (no `#0066FF`, no `#0F62FE` — Bug 1324 fix).
- Money displayed via `formatCurrency()` only. Centavos as source of truth. Prices of services/escrow/totals never trusted from client (Bug 1132 + 8 client-trusted-price violations).
- All API calls go through `apps/mobile/src/services/api.ts` which after Dispatch 01 uses MMKV with `encryptionKey` derived from a key in iOS Keychain / Android Keystore (Bug 1061 fix).
- All write actions disable the action button while in flight and show inline spinner. Toast on success, toast + retry on failure.
- All screens render correctly at viewport widths 320px (small Android), 375px (iPhone SE/12 mini), 390px (iPhone 14), 414px (iPhone Plus). Tested with Maestro + iOS simulator + Android emulator.
- All screens handle offline gracefully — read-only data shown from cache when available, write actions disabled with banner "You're offline."
- Safe-area insets respected on all screens (top notch, bottom home indicator on iOS).
- All `Pressable` components have `hitSlop` ≥ 8 and `accessibilityRole`/`accessibilityLabel`.
- All forms use `KeyboardAvoidingView` + `behavior="padding"` on iOS, `"height"` on Android.
- Navigation paths use `Routes` registry from `apps/mobile/src/config/navigation.ts`, NOT raw string paths (Bug 1185 fix). After Bug 1185 is resolved, every navigation call in this catalog is written `router.push(Routes.CUSTOMER.HOME)` not `router.push('/(tabs)/home')`.

**Decision points flagged in this catalog (require Ken's input before AI coder proceeds):**
- **SiguradoShield (6 surfaces)** — wire Layer 2 claims service OR pull all six surfaces. Affects sections 2, 4, 9, 18, 31, 33. Recommendation throughout: pull for v1.0, document in LAUNCH-LIMITATIONS.
- **Promo code redemption** — wire `POST /promo/redeem` mobile call OR remove promo input from checkout. Affects section 16.
- **Real-time chat** — currently socket.io subscribed but messages don't render. Wire OR replace with "Contact support" link. Affects section 38.

---

## 0. Mobile shell — applies to every customer screen

The customer mobile app is built with **Expo Router** (file-based routing, see `apps/mobile/app/_layout.tsx`). Every screen renders inside the root layout which provides:

**Status bar** — `StatusBar style="dark"` over light backgrounds, `style="light"` over dark hero sections. Background tinted to match content for seamless edge-to-edge.

**Safe area** — `<SafeAreaProvider>` at root; every screen uses `useSafeAreaInsets()` for top/bottom padding. Tab screens get bottom inset from tab bar height.

**Tab bar** (only visible on the 4 tab screens — sections 6, 7, 8, 9):
- 4 tabs: Home, Bookings, Wallet, Profile
- Lucide icons `Home`, `Calendar`, `Wallet`, `User` (24px)
- Active state: icon + label tinted `brand.primary` `#1B3A4B`, 2px top accent bar
- Inactive: `text-secondary` `#525252`
- Background `#FFFFFF` with `border-top` `#E5E5E5`
- Height 56px + bottom safe-area inset

**Header** (per-screen, configurable):
- Default: 44px tall, white background, `border-bottom` 1px `#E5E5E5`
- Back chevron (lucide `ChevronLeft`, 24px) on left when `router.canGoBack()`
- Title centered, Inter 600/16, max 1 line truncated
- Right action slot (configurable per screen)

**Toast container** — bottom of screen, 60px above tab bar (or 16px above safe area on non-tab screens). Uses `react-native-toast-message`. 3-second default. Tap to dismiss.

**Loading / empty / error / success — universal patterns:**
- **Loading:** skeleton placeholders matching final content shape, NOT a centered spinner. Skeleton appears within 200ms.
- **Empty:** lucide illustration (48-64px, `text-tertiary` color), concrete title (Inter 600/18), descriptive subtitle (Inter 400/14, `text-secondary`), primary action button. Example: bookings empty → "No bookings yet" + "Book your first service to see it here" + [Browse services →].
- **Error:** lucide `AlertCircle` (48px, status-red `#DA1E28`), "Something went wrong" (Inter 600/18), error explanation (one sentence, no jargon), [Retry] button. Sentry-logged with breadcrumb.
- **Offline banner:** sticky top-of-screen yellow strip with lucide `WifiOff`, "You're offline. Some features unavailable." Disappears within 1s of reconnection.

**Auth gating:** every customer screen except the 5 unauth screens (`index.tsx`, `onboarding.tsx`, `auth/login.tsx`, `auth/otp-verify.tsx`, `auth/register.tsx`) checks for valid session in `_layout.tsx`. Missing or expired → redirect to `auth/login.tsx` preserving target URL for post-login redirect.

---

## 1. index.tsx — Splash / route gateway

**Route:** `/`
**Auth:** Public, redirects based on state
**Backend:** `GET /auth/me` to validate stored session (silent)
**Audit findings:** Bug 1061 (MMKV unencrypted — must be resolved before this screen reads tokens)

**Behavior:**
This screen is invisible to most users. It's a 100-300ms transition gateway:
1. On mount, read MMKV-stored session token.
2. If no token → redirect to `/onboarding`.
3. If token exists → call `GET /auth/me` to validate.
   - 200 OK + role=`customer` → redirect to `/(tabs)/home`.
   - 200 OK + role=`provider` → redirect to `/(provider-tabs)/dashboard`.
   - 401/403 → clear tokens, redirect to `/auth/login`.
   - Network error → redirect to `/(tabs)/home` if cached user data exists, else `/auth/login`.
4. While the API call is in flight, show centered logo (96px) on white background with subtle pulse animation (NOT a spinner).

**Acceptance:**
- Test 1: First-time user (no token) → routes to `/onboarding` within 500ms.
- Test 2: Returning customer with valid token → `/(tabs)/home` within 800ms (includes API roundtrip).
- Test 3: Stale token (401) → clears MMKV, lands on `/auth/login`.
- Test 4: After Bug 1061 fix, MMKV `encryptionKey` parameter is non-undefined and reading tokens works.
- Test 5: No flash of unauthenticated UI. User never sees onboarding screen flash before being redirected to home.

---

## 2. onboarding.tsx — First-launch carousel

**Route:** `/onboarding`
**Auth:** Public
**Backend:** None
**Audit findings:** Bug 860 (Slide 2 advertises SiguradoShield™ — compounds Bug 538). **Decision required: pull SiguradoShield slide entirely OR wire claims service.**

**Layout:** swipeable horizontal carousel, 3 slides, page indicator dots at bottom, "Skip" link top-right, "Next" / "Get started" button at bottom.

**Slides (current code, ALL 3 slides need redesign):**

### Slide 1 — Welcome
- Hero illustration (lucide `Home` icon at 96px, brand.primary, with decorative dot pattern)
- Headline: "Home services, made trustworthy"
- Subhead: "Book trusted local pros for cleaning, repairs, beauty, and more."

### Slide 2 — Trust (CONTAINS Bug 860)
**Current state — must fix before launch:**
Currently displays "Verified pros, protected by SiguradoShield™" with peso-amount coverage figures. This is false advertising per Bug 538/860 — Layer 2 claims service is not wired.

**v1.0 fix (recommended):** replace with "Every pro NBI-cleared, every booking escrow-protected" using only the verifiable claims. Show two lucide icons (`ShieldCheck` for NBI, `Lock` for escrow) with one-sentence explanations. NO mentions of insurance, NO peso amounts, NO "SiguradoShield™" trademark.

**v1.1 fix (if Layer 2 wired):** can re-introduce SiguradoShield with linked safety screen.

### Slide 3 — Easy booking
- Hero illustration (lucide `Calendar` + sparkle decoration)
- Headline: "Booked in minutes"
- Subhead: "Tell us what you need. Get matched with the best pro nearby."
- Button (this slide only): "Get started" → `/auth/register`
- Below button: "Already have an account? Sign in" link → `/auth/login`

**Actions:**
- Swipe left/right between slides (animated dot indicator).
- "Skip" (top-right, all slides except last) → `/auth/register`.
- "Next" (slides 1 and 2) → advances carousel.
- "Get started" (slide 3) → `/auth/register`.
- "Sign in" link → `/auth/login`.

**States:**
- **Loading** — N/A (static content)
- **Empty** — N/A
- **Error** — N/A
- **Success** — onboarding completion writes `@hasSeenOnboarding=true` to MMKV. On re-launch, if the flag is set, `index.tsx` skips this screen even when not authenticated and routes directly to `/auth/login`.

**Acceptance:**
- Test 1: Slide 2 contains zero references to "SiguradoShield" trademark, zero peso amounts (Bug 860 fix).
- Test 2: All 3 slides use lucide icons with no emoji.
- Test 3: After completing onboarding once, re-launching the app skips this screen.
- Test 4: Swipe gestures feel native (60fps, momentum).
- Test 5: All copy reads as written by a human Marketing professional, not by an AI ($100K UX bar).

---

## 3. auth/login.tsx — Phone sign-in

**Route:** `/auth/login`
**Auth:** Public
**Backend:** `POST /auth/customer/login` { phone } → returns `{ otp_sent: true, otp_session_id }`
**Audit findings:** Bug 868 (phone.length < 10 disables button — doesn't enforce 11+ for PH numbers), Bug 869 (no biometric login option), Bug 870 (no "Forgot phone number" recovery), Bug 871 (no Terms tap link)

**Layout:**
- Top safe-area + 24px padding
- Back chevron top-left → `/onboarding`
- Hero text: "Welcome back" (Inter 700/28), "Enter your mobile number to continue" (Inter 400/14, `text-secondary`)
- Phone input field with country code selector (default +63 PH), placeholder "9XX XXX XXXX"
- "Continue" button (full-width, brand.primary, disabled until valid)
- Below button: small text "By continuing, you agree to our [Terms] and [Privacy Policy]" — both tappable links (Bug 871 fix)
- Footer: "Don't have an account? [Sign up]" → `/auth/register`

**Phone validation (Bug 868 fix):**
- Required format: PH mobile = 11 digits starting with `09` OR 10 digits starting with `9` (allow user to type either)
- Normalize internally to E.164: `+639XXXXXXXXX`
- "Continue" button disabled until phone matches `/^(09|9)\d{9}$/`
- On invalid blur: inline red text "Enter a valid PH mobile number"

**Actions:**
- **Continue button:**
  1. Disabled until valid phone.
  2. On press → spinner inside button, disable input.
  3. POST `/auth/customer/login`. Response branches:
     - 200: navigate to `/auth/otp-verify?phone=<E.164>&session=<id>`.
     - 404 (no account): toast "No account found with that number." + button label changes to "Sign up instead" → `/auth/register?phone=<E.164>` (carries phone forward).
     - 429 (rate limited): toast "Too many attempts. Try again in N minutes."
     - 500: toast "Something went wrong. Please try again."
- **Country code dropdown** — currently +63 only (PH-only launch). Show `Globe` icon, but disabled / locked to PH for v1.0. Tap shows tooltip "Currently serving the Philippines only."
- **Terms link** → `/customer/terms` (navigates as modal stack so user can return).
- **Privacy link** → currently same screen as Terms (Bug 1156 — separate Privacy screen needed; for now, anchor in terms.tsx).
- **Sign up link** → `/auth/register`.
- **Biometric quick-login (Bug 869 fix, post-Phase-14):** if user previously logged in on this device AND enabled biometric in profile, show "Use Face ID" / "Use fingerprint" button above phone input. Defer to v1.1 if not yet implemented; document in LAUNCH-LIMITATIONS.
- **"Forgot my number" link (Bug 870 fix, post-Phase-14):** below sign-up link, "Lost access to this number?" → opens support form pre-filled with account-recovery template.

**States:**
- **Loading** — spinner in Continue button, fields disabled, no overlay (lightweight).
- **Empty** — N/A (form-only screen).
- **Error** — toast for server errors. Inline red text for client-side validation.
- **Success** — brief inline confirmation ("Code sent →") then navigation.

**Acceptance:**
- Test 1: "9171234567" (10 digits starting with 9) is accepted → button enables.
- Test 2: "09171234567" (11 digits starting with 09) is accepted → button enables.
- Test 3: "1234567890" (10 digits starting with 1) is rejected → button disabled, inline error.
- Test 4: Invalid OTP request returns user to login screen with phone preserved.
- Test 5: Terms link opens as modal, dismissible without losing form state (Bug 871 fix).
- Test 6: After Bug 1061 fix, MMKV does not store auth tokens until OTP completes.

---

## 4. auth/otp-verify.tsx — OTP entry

**Route:** `/auth/otp-verify?phone=<E.164>&session=<id>`
**Auth:** Public (transitional)
**Backend:** `POST /auth/customer/verify-otp` { otp_session_id, code } → returns `{ access_token, refresh_token, user }`
**Audit findings:** Bug 872 (no auto-paste from SMS), Bug 873 (resend button visible immediately — must show timer), Bug 874 (back navigation can lose otp session), Bug 875 (60s timer not visually counting down)

**Layout:**
- Back chevron → confirm dialog "Discard sign-in?" Yes → `/auth/login`. No → stay.
- Hero: "Enter the code" (Inter 700/24)
- Subhead: "We sent a 6-digit code to +63 9XX XXX XXXX." (uses last 4 visible)
- 6 connected single-digit input boxes (auto-advance focus, paste-aware)
- Timer text below: "Resend code in 0:60" (counts down — Bug 875 fix)
- "Resend code" button (only enabled after 60s — Bug 873 fix)
- Below: "Wrong number? [Change number]" → back to login

**OTP input (Bug 872 + Bug 875 fix):**
- 6 boxes 48×48px, gap 8px, centered horizontally.
- Each box has borderColor `#E5E5E5` default, `brand.primary` when focused, `status-red` on error.
- Numeric-only keyboard (`keyboardType="number-pad"` on RN).
- iOS: `textContentType="oneTimeCode"` enables SMS auto-fill.
- Android: `autoComplete="sms-otp"` enables SMS auto-fill.
- Pasting a 6-digit code into any box distributes across all 6.
- Auto-submit when 6th digit entered (no Continue button needed).
- Timer counts down visibly: "Resend code in 0:59 → 0:58 → ..." Update every 1000ms.

**Actions:**
- **Auto-submit on 6 digits** → POST `/auth/customer/verify-otp`.
  - 200 (valid OTP): store tokens via api.ts (with encrypted MMKV — Bug 1061 fix), then `GET /auth/me`, then navigate to `/(tabs)/home`. NEW user (first login)? Navigate to `/(tabs)/home` BUT show post-signup welcome modal on first visit.
  - 400 (invalid OTP): toast "Incorrect code. Try again." + clear all 6 boxes + focus first box + flash red border briefly.
  - 410 (expired): toast "Code expired. Request a new one." + auto-trigger resend after 1s.
  - 429: toast "Too many attempts. Try again later."
- **Resend button (after 60s):**
  - On press → POST `/auth/customer/resend-otp` { otp_session_id }
  - 200: toast "New code sent." reset timer to 60s.
  - 429: toast "You've requested too many codes. Try again in N minutes."
- **Change number link** → confirm dialog "Discard this verification?" → `/auth/login` with phone NOT preserved (force re-entry).

**States:**
- **Loading** — boxes show subtle pulse during verify call. After 1s, full overlay with spinner if still pending.
- **Empty** — N/A
- **Error** — boxes flash red, clear, re-focus first. Toast error message.
- **Success** — boxes briefly turn green, then navigation transition.

**Acceptance:**
- Test 1: Pasting "123456" into any box fills all 6 (Bug 872 fix).
- Test 2: SMS auto-fill works on iOS (textContentType="oneTimeCode") and Android (autoComplete="sms-otp").
- Test 3: Resend button is disabled until 60s elapses; visual countdown updates every second (Bug 873/875 fix).
- Test 4: Back gesture / Android back button shows confirmation modal (Bug 874 fix).
- Test 5: After successful verify, auth tokens are stored in MMKV with encryptionKey set (Bug 1061 fix).

---

## 5. auth/register.tsx — Customer signup

**Route:** `/auth/register?phone=<E.164>` (phone optional, prefilled if from login screen)
**Auth:** Public (transitional)
**Backend:** `POST /auth/customer/register` { phone, first_name, last_name, email?, referral_code? } → triggers OTP, returns `{ otp_session_id }`
**Audit findings:** Bug 876 (email accepted without verification), Bug 877 (referral code accepted but not validated — fails silently if invalid at signup), Bug 878 (no consent checkbox for marketing — required by NPC), Bug 879 (no ToS/Privacy explicit acceptance), Bug 880 (last_name optional — but downstream code assumes truthy), Bug 881 (no profile photo upload step — defer to profile edit), Bug 882 (referral_code field shown empty for non-referred users — should hide unless `?ref=CODE` present)

**Layout:**
- Hero: "Create account" (Inter 700/24)
- Subhead: "It only takes a minute."
- Form fields (vertical stack, 16px gap):
  - First name (required)
  - Last name (required — Bug 880 fix)
  - Mobile number (prefilled if `?phone=` present, editable, with same validation as login)
  - Email (optional, with explicit "(optional, for receipts)" label)
  - Referral code (only shown if `?ref=` URL param present — Bug 882 fix; otherwise hidden)
- Consent block (Bug 878 + 879 fix):
  - Checkbox: "I agree to the [Terms of Service] and [Privacy Policy]" — REQUIRED. Both links open as modal.
  - Checkbox: "I want to receive promotions and tips by SMS/email" — OPTIONAL (NPC compliance: marketing consent must be opt-in, not opt-out).
- "Create account" button (full-width, brand.primary, disabled until form valid)
- Below button: "Already have an account? [Sign in]" → `/auth/login`

**Validation:**
- First name: required, 1–50 chars, allows letters + space + hyphen + apostrophe.
- Last name: required (Bug 880 fix), same rules.
- Phone: same as login.
- Email: optional but if present must match `/^[^@\s]+@[^@\s]+\.[^@\s]+$/`.
- Referral code: optional. If present, validate format `^[A-Z0-9]{6,12}$`. Server validates existence.
- Required consent checkbox: must be checked.
- Marketing consent checkbox: independent.
- "Create account" button disabled until: first_name + last_name + phone + ToS-checked all valid.

**Actions:**
- **Create account button:**
  1. Disabled until valid form.
  2. On press → spinner.
  3. POST `/auth/customer/register`.
  4. 200: navigate to `/auth/otp-verify?phone=<E.164>&session=<id>` (same flow as login).
  5. 409 (phone already registered): toast "An account already exists with this number." + button changes to "Sign in instead" → `/auth/login?phone=<E.164>`.
  6. 422 (invalid referral code — Bug 877 fix): inline red text under referral input "Referral code not found. You can continue without one." + clear referral field. Do NOT block signup.

**States:**
- **Loading** — spinner in button.
- **Empty** — N/A
- **Error** — inline field errors + toast for server errors.
- **Success** — navigation to OTP screen.

**Acceptance:**
- Test 1: Last name field is required (Bug 880 fix).
- Test 2: ToS checkbox blocks form until checked (Bug 879 fix).
- Test 3: Marketing consent checkbox is OFF by default (Bug 878 NPC compliance).
- Test 4: Invalid referral code surfaces inline error but doesn't block signup (Bug 877 fix).
- Test 5: Referral field hidden when no `?ref=` param (Bug 882 fix).
- Test 6: Email field clearly labeled "(optional, for receipts)" so users don't think it's required.

---

## 6. (tabs)/home.tsx — Customer home tab

**Route:** `/(tabs)/home`
**Auth:** Required (customer)
**Backend:** `GET /home/feed?lat=<>&lng=<>` returns `{ active_booking?, recommendations[], categories[], promotions[], suki_status }`
**Audit findings:** Bug 889 (SiguradoShield banner tappable from home — repeats Bug 538), Bug 1185 (uses string path `/(tabs)/profile` instead of `Routes.CUSTOMER.PROFILE`), Bug 883 (no pull-to-refresh), Bug 884 (location permission requested on mount before context — should explain why), Bug 885 (recommendations not personalized — same for all users), Bug 886 (categories grid hardcoded — should come from `/catalog/categories`), Bug 887 (promotions section shown but empty for all users — Bug 44/260 chain)

**Layout (top to bottom):**

### Header bar
- Greeting "Magandang umaga, Maria!" (or `araw` / `gabi` per local time, Asia/Manila). Inter 600/16.
- Right: lucide `Bell` with unread badge → `/customer/notifications`.

### Hero — active booking card (gradient allowed per Design Contract V2 §11)
- ONLY shown if `active_booking` present in feed.
- Gradient background `brand.primary` → darker shade.
- Status pill (e.g., "Provider en route · ETA 8 min")
- Provider mini-card: photo, name, rating
- "View details" CTA → `/customer/booking/[id]`
- Updates live via socket.io `customer:bookings:<user_id>` events.

### Search affordance
- Pill-shaped tappable container, lucide `Search` left, placeholder "What do you need today?"
- Tap → `/customer/search`

### Categories grid (Bug 886 fix: data-driven from `/catalog/categories`)
- 2×3 or 2×4 grid (responsive), each cell:
  - Lucide icon (32px, brand.primary on light surface)
  - Category name (Inter 500/14)
  - "Starting at ₱X" (Inter 400/12, text-secondary)
- Tap → `/customer/category/[id]`

### Suki tier card
- Shows current tier badge, progress bar to next tier, total bookings, total saved.
- Tap → `/customer/suki-pros`

### Recommendations carousel (Bug 885 fix: backend personalization)
- Title: "Suggested for you" (Inter 600/18)
- Horizontal scroll, each card:
  - Service photo (16:9)
  - Service name + provider name
  - Rating + price-from
- Tap card → `/customer/booking/configure?service=<id>`
- If empty (new user): show "Browse all services" CTA only.

### "How onService works" section (replaces SiguradoShield banner — Bug 889 fix)
- 3 short tiles: "Pick a service" / "Get matched with a pro" / "Pay safely after the job"
- Lucide icons, no peso-amount claims, no SiguradoShield references.
- (Until Bug 538 decided, this section MUST NOT mention SiguradoShield, NOT show insurance amounts, NOT link to safety.tsx in its current form.)

### Footer
- Suki referral CTA "Earn ₱100 by inviting a friend" → `/customer/referral`

**Pull to refresh (Bug 883 fix):** entire ScrollView wrapped in `RefreshControl`, refetches feed.

**Location permission (Bug 884 fix):** on first mount, BEFORE requesting location, show modal:
- Title: "We need your location"
- Body: "We use your location to show pros nearby and estimate arrival times. We never share your exact address with pros until you book."
- Buttons: [Allow location] (primary) / [Use Boracay center] (secondary)
- "Allow" → `Location.requestForegroundPermissionsAsync()` → if granted, refetch feed with coords.
- "Use Boracay center" → use default coords (11.9694, 121.9272), feed shows generic recommendations.

**States:**
- **Loading** — skeleton layout (active booking card, hero, categories, recommendations) within 200ms.
- **Empty** — for a brand-new customer with no recommendations: hide carousel section, show "Try a popular service" with top 3 categories highlighted.
- **Error** — full-screen error if feed call fails. "We couldn't load your home. [Retry]"
- **Offline** — top yellow banner. Cached feed shown if available, else offline-friendly empty state.

**Acceptance:**
- Test 1: SiguradoShield banner is REMOVED from home (Bug 889 fix). No "₱50,000 coverage" copy anywhere on this screen.
- Test 2: All navigation calls use `Routes.CUSTOMER.X` constants, not raw strings (Bug 1185 fix).
- Test 3: Location permission modal explains WHY before requesting (Bug 884 fix).
- Test 4: Pull-to-refresh works and shows native iOS/Android refresh indicator (Bug 883 fix).
- Test 5: Categories grid renders from API response, not hardcoded array (Bug 886 fix).
- Test 6: Active booking card updates within 2s of socket event (verified by mock socket).
- Test 7: At small viewport (320px width), categories grid reflows to 2 columns without overflow.

---

## 7. (tabs)/bookings.tsx — Customer bookings tab

**Route:** `/(tabs)/bookings`
**Auth:** Required (customer)
**Backend:** `GET /bookings?role=customer&status=<group>&page=<n>` paginated; socket.io `customer:bookings:<user_id>` for live updates
**Audit findings:** Bug 890 (status grouping inconsistent: code uses 17 statuses but tabs show only 3 buckets), Bug 891 (no empty state with action — just blank), Bug 892 (load more is invisible), Bug 893 (recurring bookings mixed in with one-time — should have separate filter)

**Layout:**

### Top tabs (3)
- Active (in_progress, en_route, arrived, confirmed, scheduled today)
- Upcoming (scheduled future)
- Past (completed, cancelled, refunded, disputed)

Each tab badge shows count when >0.

### Optional sub-filter chip row (Bug 893 fix)
- Below tabs, horizontal chips: [All] [One-time] [Recurring] [Disputed]
- Tap to filter within current tab.

### List
- One card per booking. Card shows:
  - Service category lucide icon (24px) + service name (Inter 600/16)
  - Provider name + photo (32×32)
  - Status pill (color per Design Contract V2)
  - Scheduled date/time (Asia/Manila, "Tomorrow 2:00 PM" style)
  - Total (₱)
  - For active bookings: live ETA / status text updated via socket

- Tap card → `/customer/booking/[id]`

### Empty state per tab (Bug 891 fix)
- Active empty: "No active bookings" + lucide `Calendar` 64px + "Book a service to see it here →" → `/customer/search`
- Upcoming empty: "Nothing scheduled yet" + same illustration + "Browse services →"
- Past empty: "No booking history" + illustration only (no CTA — they'll get there naturally)

### Pagination (Bug 892 fix)
- Visible "Load more" button at bottom of list when more pages available.
- Or auto-load on scroll-near-bottom (preferred). Show "Loading more..." indicator.

**Pull-to-refresh** standard.

**States:**
- **Loading** — 4 skeleton cards (matching list-card dimensions).
- **Empty** — per-tab as described.
- **Error** — "We couldn't load your bookings. [Retry]"
- **Offline** — show cached, banner on top.

**Acceptance:**
- Test 1: 3 tabs map to all 17 booking statuses with no booking missing from any tab (Bug 890 fix).
- Test 2: Recurring filter chip narrows list to bookings with `recurring_id IS NOT NULL` (Bug 893 fix).
- Test 3: Empty states have illustration + CTA (Bug 891 fix).
- Test 4: Live status updates via socket reflect in list within 2s (verified via mock socket).
- Test 5: Pagination loads next page within 500ms of scroll trigger.

---

## 8. (tabs)/wallet.tsx — Customer wallet tab

**Route:** `/(tabs)/wallet`
**Auth:** Required (customer)
**Backend:** `GET /wallet/customer/balance`, `GET /wallet/customer/transactions?page=<n>`
**Audit findings:** Bug 894 (balance shown as raw cents in dev — must use formatCurrency), Bug 895 (top-up button leads to web view, not in-app — must be in-app), Bug 896 (transactions don't link to booking), Bug 897 (refunds shown as +amount but wallet credit color same as cash credit — visually distinguishes refund), Bug 898 (no breakdown: "Available" vs "Pending refund"), Bug 899 (no export to CSV/PDF — defer to v1.1)

**Layout:**

### Hero balance card
- Large balance "₱1,247.50" (Inter 700/40 — large display)
- Two sub-balances if applicable: "₱200.00 pending refund" (lighter weight, secondary color)
- Two CTAs side by side:
  - [Add money] → `/customer/wallet-topup`
  - [Send] disabled with "Coming soon" tooltip (defer to v1.1)

### Quick stats row
- Total spent this month
- Suki credits earned
- Referral credits earned

### Transactions list
- Title "Recent activity"
- Each row:
  - Lucide icon (`Plus` for credits, `Minus` for debits, `RotateCcw` for refunds — Bug 897 fix)
  - Description: "Top-up via GCash" / "Booking #BK-1234" / "Refund · Booking #BK-1234"
  - Subtext: date/time (Asia/Manila)
  - Amount with sign (+₱500 in green for credits, −₱575 in `text-primary` for debits, +₱500 in `info-blue` for refunds)
  - Tap → for booking-related rows, navigate to `/customer/booking/[id]` (Bug 896 fix); for top-ups, navigate to `/customer/wallet-topup?confirmation=<id>`.

### Pagination — load more.

**States:**
- **Loading** — skeleton balance card + 5 skeleton rows.
- **Empty** — "No transactions yet" + lucide `Wallet` 64px + "Your wallet activity will appear here."
- **Error** — Retry pattern.

**Acceptance:**
- Test 1: All amounts formatted with `formatCurrency()` not raw cents (Bug 894 fix).
- Test 2: Top-up navigates to in-app screen, not web view (Bug 895 fix).
- Test 3: Refund rows visually distinct from regular credits via icon + color (Bug 897 fix).
- Test 4: Tapping a booking-related row navigates to that booking (Bug 896 fix).
- Test 5: Pending refund shown separately from available balance (Bug 898 fix).

---

## 9. (tabs)/profile.tsx — Customer profile tab

**Route:** `/(tabs)/profile`
**Auth:** Required (customer)
**Backend:** `GET /auth/me` for user data, mutations on profile update
**Audit findings:** Bug 920 (SiguradoShield™ is FIRST menu item — repeats Bug 538), Bug 900 (logout doesn't notify server — Bug 1020 chain), Bug 901 (no way to switch to provider account), Bug 902 (notification preferences buried — should be top-level menu), Bug 903 (delete account hidden in nested submenu — but NPC requires accessible erasure path), Bug 904 (app version not shown), Bug 905 (no edit photo affordance — photo is read-only)

**Layout:**

### Header card
- Avatar 80px circle (lucide `UserCircle` fallback) with edit camera badge — tap to update photo (Bug 905 fix)
- Name (Inter 700/24)
- Phone (masked) + email (if present)
- Suki tier badge

### Menu sections (vertical list, 16px gap between sections, 1px divider between rows within a section)

#### Section A — Account
- Account & security → `/customer/account-management` (covers email, phone change, password if applicable, 2FA)
- Saved addresses → `/customer/addresses`
- Payment methods → `/customer/payment-methods`
- Notifications → `/customer/notification-settings` (Bug 902: promote from nested)

#### Section B — Activity
- My bookings → `/(tabs)/bookings`
- Recurring services → `/customer/recurring`
- Refer friends → `/customer/referral`
- Suki rewards → `/customer/suki-pros`

#### Section C — Help & info
- Help center → `/customer/help`
- Terms & privacy → `/customer/terms`
- ~~Safety & SiguradoShield~~ (Bug 920 fix: REMOVE this row entirely until Layer 2 wired. If kept post-Phase 14 wire, rename to "Safety & coverage" without trademark.)
- Data rights (NPC compliance) → `/customer/data-rights`

#### Section D — Bottom
- App version display: "onService v1.0.0 (build 142)" — read-only, tappable 8 times to enable dev tools (Bug 904 fix)
- Sign out (red text, lucide `LogOut`) — confirmation modal "Sign out?" → calls `POST /auth/logout`, clears tokens, navigates to `/auth/login` (Bug 900 fix)
- Delete account (red text, lucide `Trash2`) — Bug 903 fix: kept top-level visible (not buried). Tapping → `/customer/data-rights?action=erasure` which is the NPC-compliant DSR flow.

**Actions:**
- Each menu row has chevron right (lucide `ChevronRight`) and is tappable.
- Sign out: confirmation modal, then sequential: POST `/auth/logout` (Bug 900 fix — server invalidates refresh token), clear MMKV tokens, navigate to `/auth/login`.
- Delete account: navigates to data-rights screen with erasure pre-selected.

**States:**
- **Loading** — skeleton header + 6 skeleton rows.
- **Empty** — N/A
- **Error** — fall back to MMKV-cached user data; banner "Some account info may be outdated."
- **Success** — full data renders.

**Acceptance:**
- Test 1: SiguradoShield row REMOVED or renamed without trademark (Bug 920 fix).
- Test 2: Sign out calls server logout endpoint (Bug 900 fix verified by network log).
- Test 3: Notification settings promoted to top-level Account section (Bug 902 fix).
- Test 4: Delete account row visible at bottom, navigates to NPC erasure flow (Bug 903 fix).
- Test 5: App version + build number visible (Bug 904 fix).
- Test 6: Photo edit affordance visible on avatar (Bug 905 fix).

---

## 10. customer/search.tsx — Service search

**Route:** `/customer/search?q=<query>`
**Auth:** Required
**Backend:** `GET /catalog/search?q=<>&lat=<>&lng=<>&category=<>` returns `{ services[], categories[], providers[] }`
**Audit findings:** Bug 906 (search debounced at 300ms but API call fires on every keystroke initially), Bug 907 (no recent searches stored), Bug 908 (no popular searches when input empty), Bug 909 (no filter UI — only free text), Bug 910 (results don't show distance), Bug 911 (no "no results" state — just blank list)

**Layout:**

### Header
- Back chevron + search input (auto-focused, lucide `Search` left, "X" clear right when text present)
- Right side: lucide `SlidersHorizontal` filter button (opens modal — Bug 909 fix)

### Filter modal (Bug 909 fix)
- Category multi-select
- Price range slider (₱0–₱10,000)
- Availability: today / this week / any time
- Distance: within 5km / 10km / 25km / any
- Rating: 4★+ / 4.5★+ / any
- "Apply" button at bottom; "Clear all" link top.

### Empty input state (Bug 908 fix)
- "Recent searches" section if any (Bug 907 fix — store last 10 in MMKV)
- "Popular near you" — top 5 services in user's area, fetched from `/catalog/popular?lat=<>&lng=<>`

### Results (when query present)
- Sectioned: Categories (matching), Services (matching), Providers (matching).
- Each result row:
  - Lucide icon or photo
  - Title + subtitle
  - For services: price-from + distance (Bug 910 fix)
  - For providers: rating + review count + tier badge
- Tap → respective detail/configure page.

### No results (Bug 911 fix)
- "No results for '<query>'" + lucide `SearchX` 64px
- "Try different words or [browse all services →]" → `/(tabs)/home`

**Search behavior (Bug 906 fix):**
- User types → debounce 300ms after last keystroke → fire single API call.
- Cancel previous in-flight request when new query arrives (use AbortController).
- Show inline spinner in search input during loading.

**States:**
- **Loading** — inline spinner in search bar + skeleton list rows.
- **Empty (no query)** — recent + popular sections.
- **No results** — described above.
- **Error** — toast + retry banner inline.

**Acceptance:**
- Test 1: API fires once per 300ms debounce, not per keystroke (Bug 906 fix).
- Test 2: Recent searches persist in MMKV across sessions (Bug 907 fix).
- Test 3: Empty input shows recent + popular sections (Bug 908 fix).
- Test 4: Filter modal applies multi-select category + price + availability filters to next search (Bug 909 fix).
- Test 5: Each result shows distance from user's location (Bug 910 fix).
- Test 6: No-results state has friendly copy + alternative CTA (Bug 911 fix).

---

## 11. customer/category/[id].tsx — Category browse

**Route:** `/customer/category/[id]`
**Auth:** Required
**Backend:** `GET /catalog/categories/:id/services?lat=<>&lng=<>`
**Audit findings:** Bug 912 (no sort options), Bug 913 (no info about category — just dumps services), Bug 914 (subcategories not used as sub-tabs)

**Layout:**

### Header
- Back chevron + category name
- Right: filter icon (same modal as search)

### Hero (Bug 913 fix)
- Category illustration (lucide icon 48px)
- One-line description: "Professional cleaning services for your home or office"
- Starting price range: "From ₱500"

### Sub-tabs (Bug 914 fix)
- Horizontal scroll if more than 4 subcategories.
- "All" + each subcategory.

### Sort row (Bug 912 fix)
- Lucide `ArrowUpDown` + dropdown: Recommended (default), Price low-to-high, Price high-to-low, Rating, Distance.

### Service list
- Cards showing service photo, name, provider count, price-from, rating average, distance.
- Tap → `/customer/booking/configure?service=<id>`.

**States:** standard loading / empty / error patterns.

**Acceptance:**
- Test 1: Sort options change ordering correctly (Bug 912 fix).
- Test 2: Subcategory tabs filter list (Bug 914 fix).
- Test 3: Hero shows category description (Bug 913 fix).

---

## 12. customer/booking/configure.tsx — Service configuration

**Route:** `/customer/booking/configure?service=<id>`
**Auth:** Required
**Backend:** `GET /catalog/services/:id` returns `{ service, addons[], options[] }`
**Audit findings:** Bug 915 (selected addons sent client-trusted to next step), Bug 916 (frequency selector for "make recurring" shown here but should be later step), Bug 917 (no live price preview — user goes blind to checkout), Bug 918 (date picker doesn't enforce service-area service hours)

**Layout:**

### Header
- Back chevron + service name

### Hero
- Service photo carousel
- Service name (Inter 700/24) + provider category
- "₱500" base price (Inter 600/20) — with `*` if "estimated, depends on options"

### Configuration sections

#### Service options (e.g., for cleaning: bedrooms count, bathrooms count, hours)
- Steppers / dropdowns / selects depending on `option.type`.
- Each option change updates live price preview at bottom (Bug 917 fix).

#### Add-ons (multi-select)
- Each addon: name, +₱price, info icon (tappable for description).
- Selecting toggles include/exclude.

#### Special instructions (optional textarea, max 500 chars)

#### Schedule
- Date picker (calendar)
- Time slot selector — only shows slots within the service area's operating hours (Bug 918 fix). Greyed-out slots show "Not available."

#### Address selector
- Default address, with "Change" link → `/customer/address-picker`

### Live price preview (sticky bottom, above safe area)
- Breakdown row: base + each addon + service fee
- Total (Inter 700/20)
- "Continue" button → `/customer/booking/form?config=<encoded>` (Bug 915 fix: send only IDs and quantities, NOT prices — server recomputes)

**Actions:**
- Each option/addon change → recalc preview client-side (display only).
- Continue button → POST `/booking/preview` { service_id, options, addon_ids, scheduled_at, address_id } → server returns canonical price → navigate to next step with server-returned price.

**States:**
- **Loading** — skeleton hero + skeleton options.
- **Empty** — N/A (always has data for valid service).
- **Error** — full-screen "Service not available right now. [Try another →]" → `/(tabs)/home`.

**Acceptance:**
- Test 1: Continue button posts only IDs to server, NOT computed price (Bug 915 fix verified by network log).
- Test 2: Live price preview matches server's `/booking/preview` to centavo (Bug 917 fix).
- Test 3: Time slots outside service area's hours are disabled with greyed appearance (Bug 918 fix).
- Test 4: "Make recurring" toggle is NOT on this screen (Bug 916 fix — moved to confirm step).

---

## 13. customer/booking/form.tsx — Booking form (final details)

**Route:** `/customer/booking/form?config=<id>`
**Auth:** Required
**Backend:** `POST /booking/draft` { ... } returns `{ draft_id, total }`
**Audit findings:** Bug 919 (form re-collects address — should reuse from configure), Bug 921 (special instructions field reset on back navigation)

**Purpose:** confirms the draft on the server, displays final summary before quote/confirm step.

**Layout:**
- Service summary card (read-only: service, options, addons, schedule, address)
- "Edit" link top-right → back to configure (preserves state — Bug 921 fix).
- Special instructions (optional, max 500 chars).
- Photos upload (optional, up to 5 photos showing the area/issue).
- "Next" button → calls `/booking/draft` → navigates to `/customer/booking/job-request?draft=<id>` for "Find me a pro" flow OR `/customer/booking/quotes?draft=<id>` for quote-based services OR `/customer/booking/confirm?draft=<id>` for direct-book services.

**Routing logic:** depends on `service.pricing_type`:
- `fixed` → confirm
- `quote` → job-request → quotes
- `hourly` → confirm

**Acceptance:**
- Test 1: Editing returns to configure with all selections preserved (Bug 921 fix).
- Test 2: Server returns canonical total which matches preview (Bug 917 chain).

---

## 14. customer/booking/job-request.tsx — Find a pro

**Route:** `/customer/booking/job-request?draft=<id>`
**Auth:** Required
**Backend:** `POST /booking/draft/:id/dispatch` triggers provider matching; socket.io `customer:dispatch:<draft_id>` for live updates
**Audit findings:** Bug 922 (no progress feedback — user sees blank screen), Bug 923 (no cancel option while searching), Bug 924 (timeout after 5 min not handled — UI just stalls)

**Layout:**
- Hero animation: lucide `Search` icon with rotating dot pattern around it (looks like radar)
- Status text: "Finding pros nearby..." (Inter 600/18)
- Sub: "Most jobs are matched within 2 minutes."
- Live updates as providers respond:
  - "12 pros notified"
  - "3 pros are interested"
  - "Awaiting quotes..."
- Cancel button at bottom (Bug 923 fix): "Cancel search" → confirmation → `POST /booking/draft/:id/cancel` → back to home.
- Timeout (Bug 924 fix): after 5 min, transition to "Still searching... we're trying nearby areas." After 10 min, "We couldn't find a pro right now. [Try later] / [Modify request]"

**Acceptance:**
- Test 1: Cancel button visible from start (Bug 923 fix).
- Test 2: 5-min timeout shows graceful escalation (Bug 924 fix).
- Test 3: Live counter updates within 2s of socket events.

---

## 15. customer/booking/quotes.tsx — Quote selection

**Route:** `/customer/booking/quotes?draft=<id>`
**Auth:** Required
**Backend:** `GET /booking/draft/:id/quotes`, `POST /booking/draft/:id/accept-quote { quote_id }`
**Audit findings:** Bug 925 (quotes don't show provider tier), Bug 926 (no way to message provider before accepting), Bug 927 (accept-quote sends client-trusted price), Bug 928 (no quote expiration shown)

**Layout:**
- Header: "Choose a pro" + count "3 quotes received"
- List of quote cards, each showing:
  - Provider photo + name + tier badge (Bug 925 fix)
  - Rating + review count
  - Total quote price (in ₱)
  - ETA / availability slot
  - "Quote expires in 0:23:45" (Bug 928 fix)
  - [Message] button (opens chat — Bug 926 fix) — defer to v1.1 if chat not wired
  - [Accept quote] button (Bug 927 fix: posts only quote_id, NOT price)

**Actions:**
- Accept quote → confirmation modal "Confirm booking with Juan dela Cruz at ₱575?" → POST `/booking/draft/:id/accept-quote { quote_id }` (server retrieves canonical price) → navigate to `/customer/booking/checkout?booking=<id>`.

**Acceptance:**
- Test 1: Accept-quote posts only `quote_id`, not `price` (Bug 927 fix verified by network log).
- Test 2: Tier badge visible on each quote card (Bug 925 fix).
- Test 3: Expiration timer counts down per quote (Bug 928 fix).

---

## 16. customer/booking/confirm.tsx — Pre-payment confirmation

**Route:** `/customer/booking/confirm?draft=<id>` OR `?booking=<id>`
**Auth:** Required
**Backend:** `GET /booking/:id/summary`
**Audit findings:** Bug 929 (recurring toggle here — but data structure mismatch with make-recurring screen), Bug 930 (terms acceptance not enforced — but we're committing to a contract)

**Layout:**

### Booking summary card
- Service, provider, schedule, address (read-only).
- Add-ons list.

### Make recurring? (Bug 929 + 916 fix: this is where recurring toggle belongs)
- Optional checkbox "Make this a recurring booking"
- If checked: frequency dropdown (Weekly / Bi-weekly / Monthly), end date picker (or "Until I cancel").

### Money breakdown (canonical, from server)
- Service price
- Add-ons subtotal
- Surge (if applicable, with rule name "Holiday surge 1.10x")
- Service fee
- TOTAL (Inter 700/20, brand.primary)

### Cancellation policy summary (Bug 1170 fix: derived from server `/settings/cancellation-policy`)
- "Cancel ≥24h before: full refund"
- "Cancel 12–24h before: 90% refund"
- ... (server provides this list, do NOT hardcode)
- Tappable "View full policy →" → opens modal with full server-driven policy text.

### Terms checkbox (Bug 930 fix)
- "I agree to the [booking terms] and [cancellation policy]" — required.

### CTA
- "Continue to payment" button (full-width, brand.primary, disabled until terms checked) → `/customer/booking/checkout?booking=<id>`

**Acceptance:**
- Test 1: Cancellation policy text comes from server, not from client constant (Bug 1170 fix).
- Test 2: Recurring toggle here uses same data shape as recurring screens (Bug 929 fix).
- Test 3: Terms checkbox blocks Continue (Bug 930 fix).

---

## 17. customer/booking/checkout.tsx — Payment

**Route:** `/customer/booking/checkout?booking=<id>`
**Auth:** Required
**Backend:** `GET /payment/methods`, `POST /payment/intent { booking_id, payment_method_id }`, PayMongo callback handling
**Audit findings:** Bug 44 (promo codes never redeemed — **decision required**: wire `/promo/redeem` OR remove input), Bug 931 (saved payment method shown but stripe-style brand icon emojis used), Bug 932 (no Apple Pay / Google Pay), Bug 933 (3DS handling shows white screen)

**Layout:**

### Order summary (collapsible)
- Total prominent
- "Show details" expander → shows full breakdown.

### Payment method selector
- Saved cards list (masked: "Visa •••• 4242", with brand lucide icon — Bug 931 fix to use lucide not emoji)
- "+ Add card" → opens PayMongo card form (in-app webview or native SDK)
- GCash option
- Maya option
- Apple Pay (iOS only) — Bug 932: if not implemented, hide on iOS rather than show broken
- Google Pay (Android only) — same

### Promo code input (Bug 44 decision required)
- IF promo redemption is wired: text input + Apply button.
- IF NOT wired (current state): HIDE this section entirely. Add to LAUNCH-LIMITATIONS §X.

### Pay button
- "Pay ₱575.00" (full-width, brand.primary)
- Disabled until valid payment method selected.
- On press → POST `/payment/intent` → handle PayMongo redirect / SDK flow → success → `/customer/booking/[id]?payment_success=true` → failure → `/customer/booking/payment-failed?booking=<id>`.

### 3DS handling (Bug 933 fix)
- Show in-app modal, not browser redirect.
- Header: "Verifying payment with your bank..."
- Spinner + cancel button.
- Use PayMongo SDK's native 3DS flow, not webview.

**Acceptance:**
- Test 1: Brand icons use lucide `CreditCard` variants, not emoji (Bug 931 fix).
- Test 2: Apple Pay button hidden when not implemented (Bug 932 fix).
- Test 3: 3DS challenge shows in-app modal, not white webview (Bug 933 fix).
- Test 4: If promo code field is shown, it must work end-to-end (Bug 44 fix — or hide it).

---

## 18. customer/booking/payment-failed.tsx — Payment retry

**Route:** `/customer/booking/payment-failed?booking=<id>`
**Auth:** Required
**Backend:** `GET /booking/:id/payment-status`
**Audit findings:** Bug 934 (failure reason not displayed — user has no idea why)

**Layout:**
- Lucide `AlertCircle` 64px (status-red)
- "Payment failed" (Inter 700/24)
- Failure reason from server (Bug 934 fix): "Insufficient funds" / "Card declined" / "3DS verification failed" / etc.
- "Booking #BK-1234 reserved for 15 min" (countdown)
- [Try again] button → back to checkout
- [Use different method] → checkout with method picker focused
- [Cancel booking] → confirm modal → cancel.

**Acceptance:** Failure reason visible (Bug 934 fix).

---

## 19. customer/booking/[id].tsx — Booking detail

**Route:** `/customer/booking/[id]`
**Auth:** Required (must own booking)
**Backend:** `GET /booking/:id`, socket.io `booking:<id>:status`
**Audit findings:** Bug 998 (handleCancel hardcodes reason "Cancelled by customer" — must collect real reason), Bug 952 (receipt shows servicePrice + sukiDiscount as base — should show server canonical), Bug 935 (no "Add to calendar" button), Bug 936 (provider phone shown in plain text — should use Call/Message icons that route through Twilio masked numbers), Bug 937 (chat link broken — Bug 38 chain), Bug 938 (review prompt fires before booking complete in some cases)

**Layout (status-dependent):**

### Header
- Back chevron + "Booking #BK-1234"
- Right: `MoreVertical` lucide menu

### Status hero (large, status-pill)
- Current status (e.g., "In progress" / "Awaiting payment" / "Completed")
- Sub-text contextual to status (e.g., "Provider should arrive in ~10 min based on GPS")

### Service & schedule card
- Service name + photo
- Scheduled at: "Wed, Apr 30 · 2:00 PM PHT"
- "Add to calendar" button (Bug 935 fix) — uses `expo-calendar`

### Provider card
- Photo + name + tier badge + rating
- Two action icons (Bug 936 fix):
  - Lucide `Phone` → calls Twilio-masked number `+63 28••• ••••` (proxies through real provider number, server-side)
  - Lucide `MessageCircle` → `/customer/chat/[id]` (Bug 937 fix: working chat OR remove icon)
- "View profile" link → provider public profile (defer to v1.1)

### Address card
- Map preview (static tiles, no interactive map)
- Address text
- "Get directions" button — opens device map app

### Money card (Bug 952 fix)
- Server canonical breakdown:
  - Service price (server-side `bookings.service_price`)
  - Add-ons (each)
  - Surge (with rule name)
  - Suki discount (-₱X)
  - Promo discount (-₱X)
  - Service fee
  - TOTAL
  - Status: "Held in escrow" / "Released to provider" / "Refunded"
- "View receipt PDF" button → opens PDF (uses S3 signed URL).

### Status-specific actions

**Awaiting confirmation:**
- [Cancel booking] (free cancel, no fees) — Bug 998 fix: collect reason from picker (≥1 of: "Changed my mind" / "Found another pro" / "Schedule conflict" / "Other (please describe)") → POST `/booking/:id/cancel { reason, custom_reason }`

**Confirmed (>24h before):**
- [Cancel booking] (full refund per policy) — same reason picker
- [Reschedule] — opens reschedule modal

**Confirmed (<24h before):**
- [Cancel booking] (refund per policy with preview "You'll get ₱X back") — reason picker
- Reschedule disabled with "Cancel and rebook to change time"

**In progress:**
- [Report issue] → opens chat with support pre-filled
- [Cancel] disabled

**Awaiting completion confirmation (provider says done, awaiting customer ack):**
- Big [Confirm completion] button → `/customer/booking/complete?id=<>`
- [Dispute] link below → `/customer/booking/dispute?id=<>`

**Completed:**
- [Tip] button → `/customer/booking/tip?id=<>` (if tip not yet given)
- [Review] button → `/customer/booking/review?id=<>` (if review not yet given) — Bug 938: only shown if `status='completed' AND review_id IS NULL`
- [Make recurring] → `/customer/booking/make-recurring?id=<>`
- [Book again] → `/customer/booking/configure?service=<service_id>` (preserves service + provider preference)
- [View receipt] → PDF
- [Dispute] still available within 48h dispute window

**Cancelled:**
- [Refund status] section — refund amount, status, ETA
- [Book again] → configure

### Photos & checklist (when applicable)
- Photo grid showing customer-uploaded photos + provider-uploaded checklist photos (after Bug 461 fix)
- Tap photo → fullscreen viewer.

### Chat preview
- Last 3 messages
- "Open chat" → `/customer/chat/[id]` (Bug 937 fix)

### Timeline
- Vertical timeline showing every status transition with timestamp.

**More menu (top right):**
- Share booking (deep link)
- Report a problem
- View terms

**Acceptance:**
- Test 1: Cancel collects reason from picker, not hardcoded "Cancelled by customer" (Bug 998 fix).
- Test 2: Money breakdown matches `bookings.total_amount` to centavo, not client-recomputed (Bug 952 fix).
- Test 3: Provider phone shown as Call icon, not plain number (Bug 936 fix).
- Test 4: Add-to-calendar action creates calendar event with correct details (Bug 935 fix).
- Test 5: Review button only visible after status=completed AND no existing review (Bug 938 fix).
- Test 6: Status updates within 2s of socket event.

---

## 20. customer/booking/tracker.tsx — Live job tracker

**Route:** `/customer/booking/tracker?id=<id>`
**Auth:** Required (must own booking)
**Backend:** `GET /booking/:id/tracker`, socket.io `booking:<id>:gps` for provider GPS updates
**Audit findings:** Bug 939 (GPS marker stale when socket disconnects — no indicator), Bug 940 (ETA recalc only on hard refresh), Bug 941 (no "share my location with pro" toggle — privacy issue if always-on), Bug 942 (map provider not pinned — uses default zoom)

**Layout:**

### Map (full screen)
- Provider GPS marker (live, updates via socket every ~10s)
- Customer address marker (destination)
- Route line between them (calculated by backend, not client)
- Auto-zoom to fit both markers + 20% padding (Bug 942 fix)

### Top overlay (translucent)
- Provider name + ETA "ETA 8 min"
- "Last updated: just now" / "5 min ago" — color-coded green/yellow/red (Bug 939 fix)

### Bottom sheet (collapsed by default)
- Drag to expand
- Provider photo + name + phone + chat icons
- Service summary
- Cancel button (if still allowed)

### Top right
- Lucide `Maximize2` to toggle full-screen
- Privacy toggle: "Sharing my location with pro" (Bug 941 fix — defaults OFF; only enabled when provider en-route)

**Behavior:**
- Connect to socket on mount, subscribe to `booking:<id>:gps`.
- On disconnect, show banner "Reconnecting..." and last-known timestamp turns yellow → red after 60s without update (Bug 939 fix).
- ETA recalculated server-side every minute and pushed via socket (Bug 940 fix).

**States:**
- **Loading** — skeleton map + skeleton overlay.
- **Empty** — N/A (only opens when booking has provider assigned).
- **Error** — full-screen error with retry, or fallback to non-live mode showing static address pin.

**Acceptance:**
- Test 1: Stale GPS shows yellow/red indicator (Bug 939 fix).
- Test 2: Map auto-fits both markers (Bug 942 fix).
- Test 3: Location-sharing toggle defaults off (Bug 941 fix).
- Test 4: ETA updates from server pushes, not client recalc (Bug 940 fix).

---

## 21. customer/booking/photos.tsx — Job photos viewer

**Route:** `/customer/booking/photos?id=<id>`
**Auth:** Required
**Backend:** `GET /booking/:id/photos`
**Audit findings:** Bug 461 chain (provider photos uploaded to S3 after fix — verify they appear here), Bug 943 (no zoom / pinch on photos), Bug 944 (no download to device)

**Layout:**
- Header: "Photos" + count
- Tabs: "Before" / "During" / "After" / "Issues"
- Grid (3 columns) of thumbnails
- Tap thumbnail → fullscreen viewer with pinch-zoom (Bug 943 fix), swipe between photos
- Long-press → action menu: Save to device (Bug 944 fix), Share, Report inappropriate

**Acceptance:**
- Test 1: All photo URIs are S3 URLs (no `file://` URIs — Bug 461 fix verification).
- Test 2: Pinch-zoom works in fullscreen (Bug 943 fix).
- Test 3: Save to device works on iOS + Android (Bug 944 fix).

---

## 22. customer/booking/complete.tsx — Confirm completion

**Route:** `/customer/booking/complete?id=<id>`
**Auth:** Required
**Backend:** `POST /booking/:id/customer-complete` (releases escrow)
**Audit findings:** Bug 945 (no preview of money movement before release), Bug 946 (no checklist verification step — user just clicks "Done" without checking provider actually finished)

**Layout:**

### Top
- "Confirm job completion?" (Inter 700/24)
- Sub: "This releases payment to your pro. Are they done?"

### Checklist verification (Bug 946 fix)
- Show provider's submitted checklist with all items.
- Customer can mark each as "Verified" or "Issue" (toggle).
- If any "Issue" marked → blocks completion → routes to `/customer/booking/dispute?id=<>` instead.

### Photo verification
- Show provider's after photos.
- Customer can flag photos as "Doesn't match" → blocks completion → routes to dispute.

### Money preview (Bug 945 fix)
- "₱575.00 will be released to Juan dela Cruz."
- "Service fee ₱50 retained by onService."

### Confirm button
- Full-width, brand.primary, "Confirm completion".
- Disabled until: every checklist item reviewed (Bug 946 fix).

### Below
- "Something not right? [Report an issue]" → `/customer/booking/dispute?id=<>`

**Acceptance:**
- Test 1: Confirmation blocked until every checklist item has been marked (Bug 946 fix).
- Test 2: Money preview matches server canonical amount (Bug 945 fix).
- Test 3: Marking issue routes to dispute, not completion.

---

## 23. customer/booking/review.tsx — Post-job review

**Route:** `/customer/booking/review?id=<id>`
**Auth:** Required
**Backend:** `POST /reviews`
**Audit findings:** Bug 947 (review allows submission with 0 stars — should be 1-5), Bug 948 (sub-rating optional but UI suggests required — mismatch)

**Layout:**
- "How was your service?"
- Provider photo + name
- Overall rating (5 large lucide `Star` icons, tap to set 1-5 — Bug 947 fix: minimum 1 star, no zero)
- Sub-ratings (5 categories: punctuality, professionalism, quality, value, communication) — optional, with clear "(optional)" label (Bug 948 fix)
- Text review (optional, 500 chars max, prompt: "Tell others about your experience")
- Photo upload (optional, up to 3)
- "Submit review" button — disabled until overall rating ≥1.

**After submit:** thank-you screen + suggest tip (if not already given).

**Acceptance:**
- Test 1: Submit blocked unless overall rating ≥1 (Bug 947 fix).
- Test 2: Sub-ratings clearly labeled as optional (Bug 948 fix).

---

## 24. customer/booking/tip.tsx — Tip provider

**Route:** `/customer/booking/tip?id=<id>`
**Auth:** Required
**Backend:** `POST /booking/:id/tip { amount_cents }`
**Audit findings:** Bug 949 (custom amount accepts negative values), Bug 950 (no max cap — can tip ₱1M by accident)

**Layout:**
- "Add a tip for Juan?"
- Quick amounts: ₱50, ₱100, ₱200, Custom
- Custom input (₱) — Bug 949 fix: validate >0; Bug 950 fix: max ₱5,000.
- "Skip" link
- "Send tip" button — disabled until amount valid.

**Acceptance:**
- Test 1: Negative tip blocked (Bug 949 fix).
- Test 2: Tips above ₱5,000 blocked with "Maximum tip is ₱5,000" message (Bug 950 fix).

---

## 25. customer/booking/dispute.tsx — File a dispute

**Route:** `/customer/booking/dispute?id=<id>`
**Auth:** Required
**Backend:** `POST /disputes { booking_id, type, description, evidence_photos[] }`
**Audit findings:** Bug 951 (no character minimum on description — Phase 14 must enforce ≥50)

**Layout:**
- "File a dispute" + booking summary
- Type picker (radio): Damage to property, Service not as described, Provider didn't show, Provider rude/unprofessional, Quality issue, Other.
- Description textarea (min 50 chars — Bug 951 fix; max 2000)
- Evidence photo upload (required, ≥1)
- Cancellation policy reminder text.
- "Submit dispute" button — disabled until type + ≥50 char description + ≥1 photo.

**Acceptance:**
- Test 1: Description blocks submit until ≥50 chars (Bug 951 fix).
- Test 2: At least one photo required.
- Test 3: After submit, dispute appears in admin queue within 5s.

---

## 26. customer/booking/change-order.tsx — Mid-job change request

**Route:** `/customer/booking/change-order?id=<id>`
**Auth:** Required
**Backend:** `POST /booking/:id/change-orders`
**Audit findings:** Bug 953 (price calc client-side trusted on submit), Bug 954 (no cancel option — modal can't be dismissed without submitting)

**Layout:**
- "Request a change" + booking summary
- Add-ons checklist (additional items)
- Description (free text)
- Price preview (server-driven via `/booking/:id/change-orders/preview` — Bug 953 fix)
- Submit button + Cancel button (Bug 954 fix).

**Acceptance:**
- Test 1: Price comes from server preview, not client calc (Bug 953 fix).
- Test 2: Cancel/back gesture dismisses without submitting (Bug 954 fix).

---

## 27. customer/booking/make-recurring.tsx — Convert to recurring

**Route:** `/customer/booking/make-recurring?id=<id>`
**Auth:** Required
**Backend:** `POST /recurring { booking_id, frequency, end_date? }`
**Audit findings:** Bug 1132 (CreateRecurringParams.servicePrice REQUIRED at type level — server should not trust this; remove from request type)

**Layout:**
- "Make this recurring?" + service summary
- Frequency picker (Weekly / Bi-weekly / Monthly).
- End date picker (or "Until I cancel" toggle).
- Pause options (e.g., "Pause if I'm out of town" — defer to v1.1).
- Money preview (server-driven, NO client servicePrice — Bug 1132 fix).
- Submit button.

**Acceptance:**
- Test 1: Request body to `/recurring` does NOT include `servicePrice` field (Bug 1132 fix).
- Test 2: Server-computed monthly cost displayed.

---

## 28. customer/recurring/index.tsx — Recurring list

**Route:** `/customer/recurring`
**Auth:** Required
**Backend:** `GET /recurring?role=customer`
**Audit findings:** Bug 997 (no way to create new recurring from this screen — must go through booking)

**Layout:**
- Header "My recurring services"
- List of recurring bookings, each showing: service, provider, frequency, next instance date, monthly cost, status (active/paused/cancelled).
- Tap → `/customer/recurring/[id]`
- Bug 997 fix: empty state CTA "Browse services to set up a recurring booking →" → `/(tabs)/home` (since recurring is created at booking time, not standalone).

**Acceptance:** Empty state has clear path to creating one (Bug 997 fix).

---

## 29. customer/recurring/[id].tsx — Recurring detail

**Route:** `/customer/recurring/[id]`
**Auth:** Required (must own)
**Backend:** `GET /recurring/:id`, `POST /recurring/:id/{pause|resume|cancel}`
**Audit findings:** Bug 955 (cancellation has no reason field), Bug 956 (skip-instance feature missing)

**Layout:**
- Service summary
- Frequency + next 5 instances list
- Status pill
- Money: monthly average, lifetime total
- Actions:
  - [Pause] — pause toggle with optional return date
  - [Resume] — when paused
  - [Skip next instance] — Bug 956 fix
  - [Cancel recurring] — Bug 955 fix: required reason picker (Done with service / Pro no longer available / Cost too high / Found alternative / Other) + custom reason if "Other".

**Acceptance:**
- Cancel collects reason (Bug 955 fix).
- Skip-instance works (Bug 956 fix).

---

## 30. customer/account-management.tsx — Account & security

**Route:** `/customer/account-management`
**Auth:** Required
**Backend:** Various profile mutation endpoints
**Audit findings:** Bug 957 (email change has no verification — should send confirmation link), Bug 958 (no audit of profile changes from customer side)

**Layout sections:**
- Profile photo (tap to update)
- Name (editable inline)
- Phone (read-only — change requires support)
- Email (editable, but Bug 957 fix: requires verification email click before commit)
- Date of birth (optional)
- Gender (optional, NPC: not required)
- Default address — link → `/customer/addresses`
- Notification settings — link → `/customer/notification-settings`
- Linked accounts (FB/Google login) — defer to v1.1
- Delete account — link → `/customer/data-rights?action=erasure`

**Acceptance:**
- Email change sends verification email; address only updates after click (Bug 957 fix).

---

## 31. customer/addresses.tsx — Address book

**Route:** `/customer/addresses`
**Auth:** Required
**Backend:** `GET /addresses`, `POST /addresses`, `PATCH /addresses/:id`, `DELETE /addresses/:id`
**Audit findings:** Bug 959 (default address can be deleted leaving user with no default), Bug 960 (no nickname field — addresses listed by raw text)

**Layout:**
- Header "My addresses"
- List of saved addresses, each showing:
  - Nickname (e.g., "Home", "Office") — Bug 960 fix
  - Full address text
  - "Default" badge if applicable
  - Edit / Delete swipe actions
- "+ Add address" CTA → opens add modal

**Add/edit modal:**
- Nickname (required, e.g., "Home")
- Address autocomplete (Google Places) — fallback to manual input
- Building / unit number (optional)
- Notes for pro (optional, e.g., "Gate code 1234, dog is friendly")
- Set as default toggle

**Delete:**
- Confirm modal.
- Bug 959 fix: prevent deleting default if it's the only address; if multiple, deletion auto-promotes the next one to default.

**Acceptance:**
- Default protection works (Bug 959 fix).
- Nickname field required (Bug 960 fix).

---

## 32. customer/address-picker.tsx — Address selector (modal)

**Route:** `/customer/address-picker`
**Auth:** Required
**Backend:** `GET /addresses`
**Audit findings:** Bug 961 (no search across many addresses), Bug 962 (no preview map)

**Layout:**
- Modal sheet
- List of saved addresses (current selection highlighted)
- Map preview at top showing currently-selected address pin (Bug 962 fix)
- Search input for filtering when ≥10 addresses (Bug 961 fix)
- "+ Add new address" link → `/customer/addresses` (add modal)
- Tap address → returns to caller with selected address ID.

**Acceptance:**
- Map preview visible (Bug 962 fix).
- Search activates above 10 addresses (Bug 961 fix).

---

## 33. customer/payment-methods.tsx — Saved cards

**Route:** `/customer/payment-methods`
**Auth:** Required
**Backend:** `GET /payment/methods`, `DELETE /payment/methods/:id`, `POST /payment/methods` (PayMongo SDK flow)
**Audit findings:** Bug 983 (Bug 538 reinforced via escrow section — REMOVE escrow info box), Bug 963 (deleting last payment method silently breaks active recurring bookings — must warn)

**Layout:**
- Header "Payment methods"
- List of cards: brand icon (lucide), last 4, expiry, default badge.
- Swipe actions: set default / remove.
- "+ Add card" → PayMongo flow.
- GCash / Maya: show as e-wallet section.
- Bug 983 fix: REMOVE the "Your money is protected by SiguradoShield" info box that's currently at line 82-91. Until Bug 538 decided. Replace with "All payments held in escrow until job confirmed" (factual, no insurance claim).

**Delete behavior (Bug 963 fix):**
- If method is the default AND has active recurring bookings → modal: "Removing this card will pause your recurring bookings until you set a new default. Continue?"

**Acceptance:**
- SiguradoShield box removed (Bug 983 fix).
- Default delete warning works (Bug 963 fix).

---

## 34. customer/wallet-topup.tsx — Add money to wallet

**Route:** `/customer/wallet-topup?confirmation=<id?>`
**Auth:** Required
**Backend:** `POST /wallet/topup` { amount_cents, payment_method_id } → PayMongo intent
**Audit findings:** Bug 964 (custom amount no max — can attempt ₱100M topup), Bug 965 (no minimum displayed but server enforces ₱100 min — UX silent failure)

**Layout:**
- "Add money to wallet"
- Quick amounts: ₱500, ₱1000, ₱2000, ₱5000, Custom
- Custom input — Bug 964 fix: max ₱50,000 per transaction; Bug 965 fix: min ₱100 with helper text "Minimum ₱100".
- Payment method selector (saved cards / GCash / Maya).
- "Add money" button.
- Confirmation screen on return with success animation.

**Acceptance:**
- Min/max bounds enforced client-side (Bug 964/965 fix).

---

## 35. customer/notifications.tsx — Notification inbox

**Route:** `/customer/notifications`
**Auth:** Required
**Backend:** `GET /notifications/inbox`
**Audit findings:** Bug 966 (no mark-read action), Bug 967 (no filter by type)

**Layout:**
- Header "Notifications" + [Mark all read] button (Bug 966 fix).
- Filter chips (Bug 967 fix): All, Bookings, Promotions, System.
- List: each row shows lucide icon (per type), title, body snippet, time-ago.
- Unread rows: bold text + dot indicator on right.
- Tap row → marks read + navigates to deep link target.
- Pull to refresh.

**States:**
- **Empty:** "No notifications yet" + lucide `BellOff` 64px.

**Acceptance:**
- Mark all read works (Bug 966 fix).
- Filter chips work (Bug 967 fix).

---

## 36. customer/notification-settings.tsx — Notification prefs

**Route:** `/customer/notification-settings`
**Auth:** Required
**Backend:** `GET|PATCH /notifications/preferences`
**Audit findings:** Bug 968 (no granular control — single toggle for all), Bug 969 (NPC compliance: marketing toggle not respected — backend still sends)

**Layout:**
- Section "Booking updates":
  - Push (toggle), SMS (toggle), Email (toggle) — separate per channel.
- Section "Promotions & tips":
  - Push, SMS, Email — Bug 969 fix: backend MUST honor this toggle (verified by integration test).
- Section "Account & security":
  - Push, Email (SMS always on for critical security per NPC).
- "Quiet hours" (optional): start time / end time toggle — defer to v1.1.

**Acceptance:**
- Granular per-channel control (Bug 968 fix).
- Marketing opt-out actually stops promo notifications (Bug 969 fix).

---

## 37. customer/help.tsx — Help center

**Route:** `/customer/help`
**Auth:** Required
**Backend:** Static FAQ from `/cms/help-articles`
**Audit findings:** Bug 970 (cancellation policy text differs from terms.tsx and from server — must match server), Bug 971 (contact-support button opens email client; should open in-app support ticket)

**Layout:**
- Search bar
- Category cards: Getting started, Bookings, Payments, Pros, Account.
- FAQ list expandable.
- Sticky footer "Still need help? [Contact support]" (Bug 971 fix: opens `/customer/support-ticket-new` in-app form, not mailto).
- Cancellation policy section — Bug 970 fix: rendered from server `/settings/cancellation-policy`, NOT hardcoded.

**Acceptance:**
- Cancellation policy matches server (Bug 970 fix).
- Contact support opens in-app form (Bug 971 fix).

---

## 38. customer/chat/[id].tsx — Chat with provider/support

**Route:** `/customer/chat/[id]`
**Auth:** Required
**Backend:** `GET /chat/:id/messages`, `POST /chat/:id/messages`, socket.io `chat:<id>` for live messages
**Audit findings:** Bug 38 (chat messages don't render — socket subscribed but no rendering), Bug 937 chain (chat link broken)

**DECISION REQUIRED:** wire chat OR remove all chat affordances from booking detail / quotes / etc.

**Layout (when wired):**
- Header: provider name + photo + status (online/offline indicator)
- Message list (scroll to bottom on new message)
- Input bar: text + attach photo + send button
- Typing indicator
- Read receipts

**When not wired (LAUNCH-LIMITATIONS):** screen redirects to support contact OR shows "Chat coming soon — for issues, contact support" CTA.

**Acceptance:**
- IF wired: messages render in real time, history persists, attachments work (Bug 38 fix).
- IF not wired: clean fallback, no broken UI states.

---

## 39. customer/data-rights.tsx — NPC DSR portal

**Route:** `/customer/data-rights?action=<>`
**Auth:** Required
**Backend:** `POST /dsr/requests { type, reason }`
**Audit findings:** Bug 972 (erasure shows "soft delete in 30 days" but doesn't show consequences — should explain what's lost), Bug 973 (data export download has no progress indicator)

**Layout:**
- Hero: "Your data rights"
- Six DSR types (per RA 10173):
  - Access (right to know what we have)
  - Correction (request a correction)
  - Erasure (delete my account)
  - Portability (export my data)
  - Object (stop processing)
  - Lodge a complaint with NPC
- Each type expands to explanation + action button.

**Erasure flow (Bug 972 fix):**
- Modal explaining: "This will delete your account and all bookings. Active bookings will continue. Refund history retained for tax compliance for 10 years per BIR."
- Optional reason text.
- Required typed confirmation: "DELETE".
- POST `/dsr/requests { type: 'erasure', ... }` → confirmation: "Your request will be processed within 15 days per NPC SLA."

**Portability flow (Bug 973 fix):**
- POST request → progress indicator (long-poll or socket): "Preparing your data... this may take a few minutes."
- Final state: download link (signed S3 URL, expires 24h).

**Acceptance:**
- Erasure explains consequences (Bug 972 fix).
- Portability shows progress (Bug 973 fix).
- All requests create rows in `dsr_requests` table.

---

## 40. customer/safety.tsx — Safety center

**Route:** `/customer/safety`
**Auth:** Required
**Backend:** `GET /safety/info`
**Audit findings:** **Bug 538 epicenter** + Bug 1168 (SiguradoShield amounts hardcoded line 49-52). **DECISION REQUIRED**.

**This is the most loaded screen in the app.** It currently makes specific peso-amount insurance claims with no backend claims service. Phase 14 must decide:

**Option A — Pull SiguradoShield entirely (recommended for v1.0):**
- Rename screen to "Safety & support"
- Remove all peso-amount coverage claims
- Replace with verifiable safety affordances:
  - "Every pro NBI-cleared" (with link to provider verification info)
  - "All payments held in escrow until you confirm" (factual)
  - "Background-verified pros only"
  - "24/7 support during active bookings"
  - "Emergency contact: [Call now]" → calls onService support hotline
- Remove the four peso-amount cards.
- Document in LAUNCH-LIMITATIONS §X: "SiguradoShield insurance product not available in v1.0."

**Option B — Wire Layer 2 claims service (defer to v1.1+):**
- Build /claims endpoint, claims processing workflow, insurance partner integration.
- Then restore SiguradoShield branding with valid coverage.

**For Phase 14, Option A is the recommended path. The catalog assumes Option A.**

**Layout (Option A):**
- Hero: lucide `ShieldCheck` 64px + "Booked safely with onService"
- Section "How we keep you safe":
  - NBI-cleared pros (with photo verification check)
  - Escrow payments (held until you confirm)
  - Background-verified
  - Real-time tracking
  - 24/7 support during active jobs
- Emergency contact:
  - "If you're in danger, call 911 first"
  - "Active job emergency: [Call onService Support]" → tel:+63...
- Report a safety concern → opens support ticket form
- Tips for safe bookings (FAQ-style expandable list)

**Acceptance:**
- ZERO peso-amount insurance coverage claims anywhere on screen (Bug 538 fix).
- ZERO references to "SiguradoShield" trademark (Bug 1168 fix).
- Emergency call button works on iOS + Android.

---

## 41. customer/suki-pros.tsx — Loyalty / Suki

**Route:** `/customer/suki-pros`
**Auth:** Required
**Backend:** `GET /suki/status`
**Audit findings:** Bug 974 (tier benefits hardcoded but backend has different config — must come from server)

**Layout:**
- Hero: current tier badge + progress to next tier.
- Stats: total bookings, total saved, members since.
- Tier benefits matrix (4 tiers × benefits): server-driven (Bug 974 fix).
- "How to earn faster" tips.
- "Suki pros near you" — providers you've booked before (saved-pros list).
- "Refer friends" CTA → `/customer/referral`.

**Acceptance:** tier benefits from server (Bug 974 fix).

---

## 42. customer/referral.tsx — Refer & earn

**Route:** `/customer/referral`
**Auth:** Required
**Backend:** `GET /referral/status`, `POST /referral/share`
**Audit findings:** Bug 975 (share dialog uses native share with hardcoded message in English only — should be Tagalog-aware)

**Layout:**
- Hero: "Earn ₱100 for every friend"
- Your code: large readable code "MARIA-2024" with copy button
- Share button → native share sheet with message (Bug 975 fix: localized message based on `i18n.locale`)
- Stats: invites sent, friends joined, credits earned.
- Recent invites list with status (sent / joined / first-booking-completed).

**Acceptance:** share message localized (Bug 975 fix).

---

## 43. customer/terms.tsx — Terms / Privacy / Policies

**Route:** `/customer/terms?section=<>`
**Auth:** Public (accessible from login)
**Backend:** `GET /cms/terms?version=current`
**Audit findings:** Bug 1170 (cancellation fees percentages line 28-33 mismatch platform.config.ts AND help.tsx — three different policies). **Server must be single source of truth.**

**Layout:**
- Tabs: Terms of Service | Privacy Policy | Cancellation Policy | Acceptable Use | Cookie Policy
- Each tab renders Markdown from server `cms.terms.<type>`.
- Effective date and version visible at top.
- "Last updated: <date>" + "[View previous versions]" → version history modal.
- Print/PDF export button.

**Bug 1170 fix:** Cancellation Policy tab renders from `cms.cancellation_policy` server-side. The exact same string is used by:
- platform.config (server reads it for live calculation)
- help.tsx (renders same content via shared component)
- this terms.tsx
- admin SystemSettingsPage (where it's edited)

After Phase 14 dispatch 02, all four sources match. **No hardcoded policies anywhere in client code.**

**Acceptance:**
- Cancellation policy text identical to server response, matches help.tsx and admin settings byte-for-byte (Bug 1170 fix).
- Versions accessible (NPC compliance — users can see what policy applied at booking time).

---

# Cross-cutting acceptance for the customer mobile app

These apply universally across all 43 customer screens:

1. **No emoji as iconography anywhere.** Constitution Article 4.6. Every icon is lucide via `@/components/icons`. The `apps/mobile/src/config/accessibility.ts:56-63` `statusIndicators` object — currently emoji — must be replaced with semantic text labels.
2. **Brand primary is `#1B3A4B` everywhere.** No `#0066FF` (mobile theme.ts current), no `#0F62FE` (DESIGN-CONTRACT.md old). One source of truth: tokens.json. Bug 1324 fix applies to every screen.
3. **All money is displayed via `formatCurrency()`.** Centavos source-of-truth, never raw cents in UI. Bug 894 fix applies broadly.
4. **All API requests use `apps/mobile/src/services/api.ts`** which after Bug 1061 fix has `MMKV encryptionKey` derived from secure keystore.
5. **No client-trusted prices in any mutation.** Server is canonical. Bug 1132 / Bug 915 / Bug 927 / Bug 953 / Bug 952 + 4 other client-trusted-price violations all resolved.
6. **All cancellation policy text comes from server.** Bug 1170 fix verified across `terms.tsx`, `help.tsx`, `confirm.tsx`, `[id].tsx`.
7. **Cross-source-of-truth for cancellation policy is one place.** Server `cms.cancellation_policy` is the only source.
8. **All routes use `Routes.CUSTOMER.X` constants from navigation.ts.** Bug 1185 fix verified by grep failing on raw `/(tabs)/X` strings.
9. **All screens render correctly on iPhone SE (375pt) and small Android (360dp).** Verified by Maestro flow on both.
10. **All screens have all 4 states implemented.** Loading skeleton within 200ms, empty with illustration + CTA, error with retry, offline with banner.
11. **No `console.log` / `console.warn` / `console.error` in production.** Constitution Article 4.2. Replaced with `logger.debug/info/warn/error` from `@/lib/logger` which routes to Sentry in production and dev console only.
12. **No `axios`.** Constitution Article 7.1. Use `fetch` wrapper in `api.ts`. Bug 1271 chain.
13. **All form fields have appropriate keyboardType, autoComplete, textContentType (iOS) and inputMode.**
14. **All screens are accessible.** VoiceOver/TalkBack labels on every interactive element.
15. **All screens handle deep-linking via `Routes`.** A push notification deep link to `/customer/booking/[id]` works whether the app is cold-launched or resumed.
16. **SiguradoShield is removed from 6 surfaces** (per the Option A decision throughout this catalog): home.tsx (Bug 889), profile.tsx (Bug 920), onboarding.tsx slide 2 (Bug 860), payment-methods.tsx (Bug 983), safety.tsx (Bug 538/1168), platform.config.ts (Bug 1168). Verified by grep finding zero matches across the mobile codebase.
17. **App version visible in settings.** Bug 904 fix verified.
18. **Session logout calls server.** Bug 900 / Bug 1020 / Bug 1260 fix verified.

---

# What's next: Part 2C (mobile provider screens) and Part 3 (bug remediation manual)

This catalog covered the 43 mobile customer screens. When Ken says "continue," I'll deliver:

- **Part 2C** — the ~40 mobile provider screens. The 10-screen provider onboarding flow (role-select → terms → categories → service-area → documents → selfie → IC agreement → background-check-status → identity-verification → review-pending), 4 tabs (dashboard, jobs, suki-customers, profile), the 6-screen job execution flow (job/[id] → checklist → quote → photos → complete → navigate), schedule + availability + calendar, services + skills + certifications, portfolio, payouts + withdraw + payout-settings, suki-customers, tier-progression, reviews, account-management, settings.

After Part 2C, the deliverables are:
- **Part 3** — Bug Remediation Manual (every one of 1,371 bugs with file:line + exact fix code + test signature, grouped into 14 dispatches)
- **Part 4** — Gate Hardening (actual shell + CI configuration that prevents fake-green)
- **Part 5** — Ken Handbook (written for non-developer review, click-through verification)
