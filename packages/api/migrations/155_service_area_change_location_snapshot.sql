-- Bug UX-260: make the provider service-area review queue authoritative for
-- the coordinates that matching actually uses. Existing rows remain valid;
-- new requests snapshot the proposed location and the selected area's labels.

BEGIN;

ALTER TABLE service_area_change_requests
  ADD COLUMN requested_latitude DECIMAL(10, 8),
  ADD COLUMN requested_longitude DECIMAL(11, 8),
  ADD COLUMN requested_city VARCHAR(100),
  ADD COLUMN requested_province VARCHAR(100),
  ADD CONSTRAINT service_area_change_requested_latitude_ph
    CHECK (requested_latitude IS NULL OR requested_latitude BETWEEN 4.5 AND 21.5),
  ADD CONSTRAINT service_area_change_requested_longitude_ph
    CHECK (requested_longitude IS NULL OR requested_longitude BETWEEN 116 AND 127.5);

COMMENT ON COLUMN service_area_change_requests.requested_latitude IS
  'Provider-submitted location reviewed with the area change; applied to providers.latitude only on approval.';
COMMENT ON COLUMN service_area_change_requests.requested_longitude IS
  'Provider-submitted location reviewed with the area change; applied to providers.longitude only on approval.';
COMMENT ON COLUMN service_area_change_requests.requested_city IS
  'Server-derived service-area city snapshot applied to the provider profile on approval.';
COMMENT ON COLUMN service_area_change_requests.requested_province IS
  'Server-derived service-area province snapshot applied to the provider profile on approval.';

COMMIT;
