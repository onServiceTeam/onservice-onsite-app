-- Extensions for the local dev database.
-- Per Phase 14 Dispatch 0.5.
--
-- PostGIS comes from the postgis/postgis:18-3.5 image (Phase 14 D10's
-- reassign-eligibility query uses ST_DWithin / ST_MakePoint).
-- pgcrypto provides gen_random_uuid() used throughout migrations.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
