-- Admin authentication: add password_hash for admin email/password login
-- Uses Node.js crypto.scryptSync format: salt:hash (hex encoded)
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Default super_admin will be seeded via the API seed script
-- Password hashing is done in application code (Node.js scrypt)
-- Run: npm run seed to create the default admin account
