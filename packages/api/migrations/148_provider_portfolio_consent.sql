-- Record the provider's customer-consent affirmation for every published
-- portfolio image. Existing rows remain readable; all new API writes require
-- an affirmation and receive a timestamp.
ALTER TABLE provider_portfolios
  ADD COLUMN IF NOT EXISTS customer_consent_confirmed_at TIMESTAMPTZ;
