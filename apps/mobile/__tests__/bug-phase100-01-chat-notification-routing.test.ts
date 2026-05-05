// BUG-PHASE100-01 — chat-related notifications (new_message,
// chat_last_message, chat_started) route directly to the chat
// thread on both customer and provider sides.
//
// Pre-fix the routing logic in customer/notifications.tsx and
// provider/notifications.tsx checked `notifData?.bookingId` first
// and routed everyone to the booking/job detail screen. Chat
// notifications include `bookingId` in their data payload (set by
// booking-admin.service when an admin sends to a customer + by the
// regular messaging endpoints), so they fell into that branch and
// the user was dumped on the booking/job detail screen. To
// actually read the message that just buzzed their phone they had
// to tap "Chat with Provider" / "Chat with Customer" once more —
// two taps where one should do.
//
// Fix: both screens add a chat-type short-circuit BEFORE the
// generic bookingId branch. When notif.type matches a chat type
// AND bookingId is present, route to the chat thread directly.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const CUSTOMER = readFileSync(
  resolve(__dirname, '../app/customer/notifications.tsx'),
  'utf8',
);
const PROVIDER = readFileSync(
  resolve(__dirname, '../app/provider/notifications.tsx'),
  'utf8',
);

const CHAT_TYPES_CHECK = /'new_message'\s*\|\|\s*notif\.type === 'chat_last_message'\s*\|\|\s*notif\.type === 'chat_started'/;

describe('BUG-PHASE100-01 — chat notifications route to chat threads on both sides', () => {
  it('BUG-PHASE100-01 — customer notifications shortcut hits all 3 chat types', () => {
    expect(CUSTOMER).toMatch(CHAT_TYPES_CHECK);
  });

  it('BUG-PHASE100-01 — customer chat shortcut precedes the generic bookingId branch', () => {
    const chatBranchIdx = CUSTOMER.indexOf("router.push(`/customer/chat/${notifData.bookingId}`)");
    const detailBranchIdx = CUSTOMER.indexOf("router.push(`/customer/booking/${notifData.bookingId}`)");
    expect(chatBranchIdx).toBeGreaterThan(0);
    expect(detailBranchIdx).toBeGreaterThan(0);
    expect(chatBranchIdx).toBeLessThan(detailBranchIdx);
  });

  it('BUG-PHASE100-01 — provider notifications shortcut hits all 3 chat types', () => {
    expect(PROVIDER).toMatch(CHAT_TYPES_CHECK);
  });

  it('BUG-PHASE100-01 — provider chat shortcut precedes the generic bookingId branch', () => {
    const chatBranchIdx = PROVIDER.indexOf("router.push(`/provider/chat/${notifData.bookingId}`)");
    const detailBranchIdx = PROVIDER.indexOf("router.push(`/provider/job/${notifData.bookingId}`)");
    expect(chatBranchIdx).toBeGreaterThan(0);
    expect(detailBranchIdx).toBeGreaterThan(0);
    expect(chatBranchIdx).toBeLessThan(detailBranchIdx);
  });
});
