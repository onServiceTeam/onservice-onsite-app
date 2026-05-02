# Phase D Findings Part 8 — Provider Profile + Addresses + Chat (top 3 remaining customer screens)

Files added in this batch (partial reads — top 350 lines of each):
- `apps/mobile/app/customer/provider/[id].tsx` (596 — read 350)
- `apps/mobile/app/customer/addresses.tsx` (511 — read 300)
- `apps/mobile/app/customer/chat/[id].tsx` (440 — read 350)

**Phase D running total: ~10,919 lines fully read.**
**Audit grand total: ~30,593 lines fully read.**

(Note: 3 large files read partial. Bottom halves of provider/[id], addresses, and chat are mostly StyleSheet definitions — low likelihood of additional bugs. Will be re-read in Phase D continuation if a future session needs more depth.)

---

## CRITICAL bugs (continuing from CRIT-90)

### CRIT-91 — Chat is COMPLETELY BROKEN on any device that ran the Bug-1061 auth-migration
**File:** [apps/mobile/app/customer/chat/[id].tsx:94-141](apps/mobile/app/customer/chat/[id].tsx#L94)
```ts
useEffect(() => {
  if (!conversationId) return;
  const socket = connectSocket();   // ← CRIT-85: reads token from legacy storage
  joinConversation(conversationId);
  ...
});
```

**Confirms CRIT-85 (D06) at the customer-screen level.** Chat depends entirely on socket.io. After auth-migration runs (which deletes the legacy `accessToken` from the unencrypted MMKV), `connectSocket()` reads `undefined` and the socket fails to authenticate.

**Customer experience after Bug-1061 fix is in production:**
- Open any booking → tap "Chat with Provider"
- Screen shows "Setting up chat..." spinner → resolves to chat UI
- New messages from provider NEVER arrive in real-time (socket dead)
- Customer's own messages send via REST POST (line 147 sendMessageApi) — works
- But provider's responses don't appear until customer manually pulls-to-refresh
- Typing indicators broken
- Read receipts broken

**Customer-perceived experience:** "I sent a message — provider isn't responding!" Provider on their side is responding, but customer doesn't see it.

This is a downstream blocker waiting on CRIT-85 fix. Already counted in CRIT-85 dispatch — listing here to make the customer-facing impact explicit.

---

## MEDIUM bugs

### MED-171 — addresses.tsx error handling uses inline axErr pattern (CRIT-69 manifestation)
**File:** [apps/mobile/app/customer/addresses.tsx:66-68, 79-81](apps/mobile/app/customer/addresses.tsx#L66)
```ts
onError: (err: unknown) => {
  const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to save address.';
  Alert.alert('Error', msg);
},
```
Same axErr-style cast as CRIT-69. Server's specific errors (e.g., "Address limit exceeded — 10 max", "Coordinates outside service area") never reach the user. Same fix dispatch.

### MED-172 — chat.tsx send-failed Alert shows generic message
**File:** [apps/mobile/app/customer/chat/[id].tsx:154-156](apps/mobile/app/customer/chat/[id].tsx#L154)
```ts
} catch {
  Alert.alert('Send Failed', 'Message could not be sent. Please try again.');
}
```
Catches without typing — server's specific "blocked: bypass attempt detected" or "conversation closed" messages don't surface.

### MED-173 — chat.tsx photo upload generic error
**File:** [apps/mobile/app/customer/chat/[id].tsx:189-191](apps/mobile/app/customer/chat/[id].tsx#L189)
Same `catch {} → Alert.alert` pattern. Photo upload errors (file too large, invalid format) are hidden.

### MED-174 — provider/[id] tier color/label maps don't include 'founding' tier
**File:** [apps/mobile/app/customer/provider/[id].tsx:27-32, 36-41](apps/mobile/app/customer/provider/[id].tsx#L27)
```ts
const TIER_COLORS: Record<string, string> = {
  new: colors.tierNew,
  verified: colors.tierVerified,
  pro: colors.tierPro,
  elite: colors.tierElite,
};
```
Server's tier enum (verified in C01/admin.validators.ts line 12) is `'founding' | 'new' | 'verified' | 'pro' | 'elite'`. Mobile tier maps don't include 'founding'. Founding-tier providers display with `colors.textTertiary` fallback — no specific color/label.

### MED-175 — chat.tsx response receipt shows ✓ vs ✓✓ via `isRead` only
**File:** [apps/mobile/app/customer/chat/[id].tsx:228-230](apps/mobile/app/customer/chat/[id].tsx#L228)
```ts
{item.isRead ? '✓✓' : '✓'}
```
Two-state read receipt. Industry standard is three-state (sent / delivered / read). For v1.0 this is acceptable.

### MED-176 — addresses form lacks geocoding (lat/lng)
**File:** [apps/mobile/app/customer/addresses.tsx:101-108](apps/mobile/app/customer/addresses.tsx#L101)
Address payload submitted without `latitude` / `longitude`. Provider matching service likely needs coords for radius/distance. If saved address has no coords, booking-from-address falls back to barangay/city text matching only. Should integrate with address-picker (which has lat/lng).

### MED-177 — chat photo size hardcoded quality 0.7
**File:** [apps/mobile/app/customer/chat/[id].tsx:172](apps/mobile/app/customer/chat/[id].tsx#L172)
JPEG quality 0.7 — reasonable. No max-size guard. If user sends a 50MB DSLR photo, upload fails silently or hits server's 10MB limit (per `platformConfig.maxImageSizeMB: 10`). Should resize on-device first.

---

## LOW / INFO

- **provider/[id].tsx is comprehensive:** profile card, services, schedule, portfolio, certifications, review aggregate + individual reviews, response rate badge.
- **provider/[id].tsx D04 SiguradoShield pull comment** at line 339-344 — Bug 834 fix correctly applied.
- **addresses.tsx UX is solid** — labeled addresses (Home/Work/Other), default selection, ConfirmModal for delete (Bug 998).
- **chat.tsx supports text + image messages** with inline photo button. Real-time when socket works (CRIT-85 / CRIT-91 caveat).
- **chat.tsx debounced typing indicator** (line 196-209) — clean implementation.
- **chat.tsx handles missing conversation by creating one** (line 65-68) — defensive.

---

## Phase D status

I'm closing this session at ~10,919 lines of Phase D fully read. Remaining high-priority customer screens (search, suki-pros, recurring/[id], notifications, safety-and-support, help, address-picker, category, referral, _layout) + mobile components (PhoneInput, Avatar, FilterChips, etc.) total ~5,000 lines. They will land in Phase D continuation.

Updating handoff next.
