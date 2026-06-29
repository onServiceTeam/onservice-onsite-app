-- D27 Phase 3 — itemized parts/materials on change orders.
--
-- Until now a change order was a single opaque `additional_amount` with a
-- free-text description. A provider who discovers mid-job that they need a
-- specific part (e.g. a ₱800 replacement faucet + ₱500 labor) could only put
-- "₱1,300" with no breakdown, so the customer had to approve a number they
-- couldn't see inside.
--
-- This table mirrors quote_line_items (migration 018). When a change order has
-- line items, the server computes `additional_amount` as the sum of the line
-- totals (server-canonical, same as quotes) — the client-sent amount is ignored.
-- A change order with no line items keeps the legacy lump-sum path.

CREATE TABLE IF NOT EXISTS change_order_line_items (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
    unit VARCHAR(30) NOT NULL DEFAULT 'unit',
    unit_price INTEGER NOT NULL,
    line_total INTEGER NOT NULL,
    -- Parts/materials are the common case for a mid-job change order, so the
    -- default item_type is 'materials' (quotes default to 'labor').
    item_type VARCHAR(20) NOT NULL DEFAULT 'materials'
        CHECK (item_type IN ('labor', 'materials', 'equipment', 'other')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_co_line_items_co ON change_order_line_items(change_order_id);
