# Gate 2 — Paper Trace (Phase 10)

## Real-time emission paths

### 1. `createBooking` → `BOOKING_CREATED` admin event
1. HTTP POST hits booking route handler.
2. `bookingService.createBooking({...})` runs the original transaction (unchanged).
3. AFTER commit, on the success path, the new try/catch executes:
   - `socketService.emitAdminEvent(ADMIN_EVENTS.BOOKING_CREATED, {id, status, customerId, providerId, totalCentavos})`.
   - Inside `emitAdminEvent`, `io?.to('admin:global').emit('booking:created', ...)`.
   - All admin sockets joined to `admin:global` receive it.
4. On any throw inside the emit block: `logger.warn` only — original return value still flows back.

### 2. `transitionBookingStatus` → `BOOKING_STATUS_CHANGED`
Same pattern. Emits `{id, oldStatus, newStatus}` on every successful state transition.

### 3. `fileDispute` → `DISPUTE_FILED`
Same pattern. Emits `{id, bookingId, status}` after dispute row commits.

## Auth path
1. Admin page calls `getAdminSocket()`.
2. Hook reads JWT from `localStorage.admin_token`.
3. `io(VITE_API_URL, { auth: { token } })`.
4. Server-side, `io.use` middleware verifies JWT (`jwt.verify`) using existing logic from socket.service.ts (unchanged).
5. On success, the new line `if (socket.userRole === 'admin' || ...) socket.join('admin:global')` runs.

## Frontend reactivity path
1. `useAdminSocketEvent('booking:status_changed', cb)` registers listener on the singleton socket.
2. Server emits → callback fires → `queryClient.invalidateQueries({queryKey: ['adminBookings']})`.
3. TanStack Query refetches the bookings list → row badge updates.

## Money paths
NONE. No money math was added, modified, or moved this phase. All hooks fire AFTER existing transactions commit. emit failures are non-fatal.

## Idempotency
Socket emits are NOT idempotent — every successful service call emits exactly once. Listeners must accept potential duplicates if a client reconnects mid-flight (TanStack Query invalidation is naturally idempotent).
