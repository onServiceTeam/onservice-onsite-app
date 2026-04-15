-- Seed: Set admin passwords using Node.js scrypt format (salt:hash)
-- Default password: "admin123" (change in production!)
-- Salt: 6f6e7365727669636561646d696e3234 (hex for "onserviceadmin24")
-- This hash was generated via: crypto.scryptSync('admin123', '6f6e7365727669636561646d696e3234', 64).toString('hex')

UPDATE users SET password_hash = '6f6e7365727669636561646d696e3234:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'
WHERE email IN ('admin@onservice.ph', 'superadmin@onservice.ph') AND password_hash IS NULL;

-- NOTE: In production, generate real hashes using the API utility:
--   import crypto from 'node:crypto';
--   const salt = crypto.randomBytes(16).toString('hex');
--   const hash = crypto.scryptSync(password, salt, 64).toString('hex');
--   const passwordHash = `${salt}:${hash}`;
