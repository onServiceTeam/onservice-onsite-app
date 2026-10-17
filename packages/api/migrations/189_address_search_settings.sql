-- Migration 189: Google address search controls (D24 Option A, Ken 2026-10-18). Additive only.
--
-- Ken chose Google address search for the customer address picker (D24
-- Option A; D41 Q16): suggestions while typing, the chosen suggestion as an
-- address, and a map pin turned into an address, all through our own server
-- (services/geo/address-search.service.ts), Philippines only, with daily
-- caps. These six rows are the admin controls for it, under
-- dispatch / address_search, next to the map settings.
--
--   address_search_enabled                        on/off switch. Address search
--                                                 also needs the server key
--                                                 (GOOGLE_MAPS_SERVER_KEY); with no
--                                                 key it stays off whatever this says.
--   address_search_user_daily_autocomplete_limit  suggestion lists per user per
--                                                 Manila calendar day.
--   address_search_user_daily_lookup_limit        chosen suggestions plus pin
--                                                 lookups per user per Manila day.
--   address_search_platform_daily_limit           all Google address calls per
--                                                 Manila day, every user together
--                                                 (Ken's bill guard).
--   address_search_timeout_ms                     a Google call is abandoned after this.
--   address_search_cooldown_minutes               after Google refuses a call or it
--                                                 times out, no calls for this long.
--
-- The values are conservative engineering defaults; Ken has not set any of
-- them. Over a cap the API answers 429 and the app falls back to typing the
-- address. SETTING_DEFAULTS in settings.service.ts carries the same keys and
-- defaults (boot drift check), and getAddressSearchPolicy() applies the same
-- min/max bounds. ON CONFLICT DO NOTHING keeps an operator's value.
--
-- Data safety: six new settings rows. Nothing existing is changed, dropped or
-- renamed.
-- No BEGIN/COMMIT: run-reviewed-migrations.mjs applies it in one transaction.

INSERT INTO platform_settings (category, subcategory, key, label, description, value_type,
  value, default_value, min_value, max_value, unit, display_order, is_active) VALUES
 ('dispatch','address_search','address_search_enabled','Address search (Google)','When on, and the server has a Google key, customers get address suggestions while typing and can turn a map pin into an address. Off, or with no key, the app keeps its own address picker. Customers can always edit the address before saving.','boolean','true','true',NULL,NULL,NULL,130,TRUE),
 ('dispatch','address_search','address_search_user_daily_autocomplete_limit','Address suggestions per user per day','How many suggestion lists one signed-in user can get per day (Manila time). After that the app asks them to type the address. 0 turns suggestions off.','integer','60','60',0,1000,'searches',131,TRUE),
 ('dispatch','address_search','address_search_user_daily_lookup_limit','Address lookups per user per day','How many chosen suggestions or map pins one signed-in user can turn into an address per day (Manila time). 0 turns these lookups off.','integer','30','30',0,500,'lookups',132,TRUE),
 ('dispatch','address_search','address_search_platform_daily_limit','Google address calls per day (all users)','Bill guard: once all users together have made this many Google address calls in one day (Manila time), address search stops until midnight. 0 stops all calls.','integer','500','500',0,100000,'calls',133,TRUE),
 ('dispatch','address_search','address_search_timeout_ms','Address search time limit','A Google call that takes longer than this is abandoned and the customer types the address instead.','integer','3000','3000',1000,10000,'milliseconds',134,TRUE),
 ('dispatch','address_search','address_search_cooldown_minutes','Address search pause after a Google refusal','After Google refuses a call (for example billing off) or a call times out, the server stops calling Google for this many minutes.','integer','10','10',1,1440,'minutes',135,TRUE)
ON CONFLICT (key) DO NOTHING;
