-- CRIT-PHASE16-01 fix — uuidv7() shim for Postgres < 18.
--
-- Postgres 18 ships built-in uuidv7(). Many migrations use it as
-- the PRIMARY KEY DEFAULT. Local dev pinned PG17 because
-- postgis/postgis:18-3.5 isn't on Docker Hub yet.
--
-- This shim produces an RFC 9562 v7 UUID:
--   * 48 bits unix_ts_ms (big-endian)
--   * 4 bits version = 7
--   * 12 bits rand_a
--   * 2 bits variant = 0b10
--   * 62 bits rand_b
--
-- Implementation: build a 16-byte buffer from scratch using
-- pgcrypto's gen_random_bytes(), then patch in the timestamp
-- bytes + version nibble + variant bits.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP FUNCTION IF EXISTS public.uuidv7();

CREATE OR REPLACE FUNCTION public.uuidv7()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
    ts_ms      bigint;
    buf        bytea;
BEGIN
    ts_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;

    -- Start with 16 random bytes; we'll overwrite the first 6 with
    -- the timestamp and patch byte 6 (version nibble) + byte 8
    -- (variant bits) afterwards.
    buf := gen_random_bytes(16);

    -- Bytes 0-5: 48-bit big-endian timestamp.
    buf := set_byte(buf, 0, ((ts_ms >> 40) & 255)::int);
    buf := set_byte(buf, 1, ((ts_ms >> 32) & 255)::int);
    buf := set_byte(buf, 2, ((ts_ms >> 24) & 255)::int);
    buf := set_byte(buf, 3, ((ts_ms >> 16) & 255)::int);
    buf := set_byte(buf, 4, ((ts_ms >>  8) & 255)::int);
    buf := set_byte(buf, 5, ( ts_ms        & 255)::int);

    -- Byte 6 high nibble = version 7. Keep low nibble random.
    buf := set_byte(buf, 6, ((get_byte(buf, 6) & 15) | 112));

    -- Byte 8 high two bits = variant 10. Keep low six bits random.
    buf := set_byte(buf, 8, ((get_byte(buf, 8) & 63) | 128));

    -- encode(bytea, 'hex') gives 32 hex chars; uuid::text format
    -- requires 8-4-4-4-12 with hyphens. We rely on the cast from
    -- text-without-hyphens — Postgres uuid_in accepts this form.
    RETURN encode(buf, 'hex')::uuid;
END;
$$;

COMMENT ON FUNCTION public.uuidv7() IS
  'CRIT-PHASE16-01 — uuidv7() shim for Postgres < 18.';

-- Self-test: verify the version nibble is ''7'' (canonical UUID
-- string position 15, 1-indexed).
DO $$
DECLARE
    sample uuid;
    s      text;
BEGIN
    sample := public.uuidv7();
    s := sample::text;  -- xxxxxxxx-xxxx-Mxxx-Nxxx-xxxxxxxxxxxx
    IF substring(s, 15, 1) <> '7' THEN
        RAISE EXCEPTION 'uuidv7() shim version nibble wrong: %', s;
    END IF;
    -- Variant nibble (position 20) must be 8, 9, a, or b.
    IF substring(s, 20, 1) NOT IN ('8','9','a','b') THEN
        RAISE EXCEPTION 'uuidv7() shim variant bits wrong: %', s;
    END IF;
END$$;
