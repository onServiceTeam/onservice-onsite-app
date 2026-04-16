-- Migration 034: Fix wallet UNIQUE constraint for dual-role users
-- Bug: UNIQUE(user_id) prevents a user who is both a customer and provider
-- from having separate wallets for each role.
-- Fix: Replace with UNIQUE(user_id, type) to allow one wallet per role per user.

DROP INDEX IF EXISTS idx_wallets_user;
CREATE UNIQUE INDEX idx_wallets_user_type ON wallets(user_id, type) WHERE user_id IS NOT NULL;
