-- Phase 14 Dispatch 07 — Bug 460 + 463.
-- Server-driven checklist templates per service category.
--
-- D07 spec corrections:
-- - Renumbered from spec's 076 (D06 took 075+076).
-- - Templates keyed on category_id (not subcategory_id per spec) for v1.0
--   simplicity. v1.1 polish can add subcategory-specific overrides.
-- - created_by FK references users(id) (admin_users table doesn't exist).
--
-- Tables:
--   checklist_templates           — versioned template per category
--   checklist_template_sections   — section grouping (Pre-service, Kitchen, etc.)
--   checklist_template_items      — individual line items with photo_required flag
--   booking_checklists            — per-booking instance, snapshot of template+version
--   booking_checklist_items       — per-booking item completion state + photo link

BEGIN;

CREATE TABLE checklist_templates (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    category_id UUID NOT NULL REFERENCES service_categories(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (category_id, version)
);
CREATE INDEX idx_checklist_templates_category_active
    ON checklist_templates(category_id, version DESC)
    WHERE is_active = TRUE;

CREATE TABLE checklist_template_sections (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    template_id UUID NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
    display_order INTEGER NOT NULL,
    title TEXT NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (template_id, display_order)
);

CREATE TABLE checklist_template_items (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    section_id UUID NOT NULL REFERENCES checklist_template_sections(id) ON DELETE CASCADE,
    display_order INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    photo_required BOOLEAN NOT NULL DEFAULT FALSE,
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (section_id, display_order)
);

-- Per-booking instance — snapshots template+version so future template
-- edits don't change historical job records.
CREATE TABLE booking_checklists (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES checklist_templates(id),
    template_version INTEGER NOT NULL,
    shown_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (booking_id)
);

CREATE TABLE booking_checklist_items (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    booking_checklist_id UUID NOT NULL REFERENCES booking_checklists(id) ON DELETE CASCADE,
    template_item_id UUID NOT NULL REFERENCES checklist_template_items(id),
    -- Snapshot of item title/description at checklist creation time so
    -- subsequent template edits don't change historical state.
    title_snapshot TEXT NOT NULL,
    description_snapshot TEXT,
    photo_required BOOLEAN NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    photo_id UUID, -- FK to booking_photos added in migration 079
    notes TEXT
);
CREATE INDEX idx_bcl_items_checklist ON booking_checklist_items(booking_checklist_id);
CREATE INDEX idx_bcl_items_completed ON booking_checklist_items(booking_checklist_id, is_completed);

-- ────────────────────────────────────────────────────────────────────
-- Seed starter templates for the 10 launch service categories
-- ────────────────────────────────────────────────────────────────────

-- Cleaning
WITH t AS (
    INSERT INTO checklist_templates (category_id) VALUES (
        (SELECT id FROM service_categories WHERE slug = 'cleaning')
    ) RETURNING id
), s AS (
    INSERT INTO checklist_template_sections (template_id, display_order, title)
    SELECT t.id, x.display_order, x.title FROM t CROSS JOIN (VALUES
        (1, 'Pre-service walk-through'),
        (2, 'Living areas'),
        (3, 'Kitchen'),
        (4, 'Bathroom'),
        (5, 'Final walk-through')
    ) AS x(display_order, title)
    RETURNING id, display_order
)
INSERT INTO checklist_template_items (section_id, display_order, title, photo_required, is_required)
SELECT s.id, x.display_order, x.title, x.photo_required, TRUE FROM s
CROSS JOIN LATERAL (VALUES
    -- Section 1: Pre-service
    (1, 1, 'Inspect work area with customer', TRUE),
    (1, 2, 'Note any pre-existing damage', FALSE),
    -- Section 2: Living areas
    (2, 1, 'Vacuum / mop floor', FALSE),
    (2, 2, 'Dust surfaces', FALSE),
    (2, 3, 'Photo: living area after', TRUE),
    -- Section 3: Kitchen
    (3, 1, 'Wipe counters', FALSE),
    (3, 2, 'Clean stovetop', FALSE),
    (3, 3, 'Photo: kitchen after', TRUE),
    -- Section 4: Bathroom
    (4, 1, 'Scrub toilet', FALSE),
    (4, 2, 'Wipe sink + mirror', FALSE),
    (4, 3, 'Photo: bathroom after', TRUE),
    -- Section 5: Final
    (5, 1, 'Walk customer through completed work', FALSE),
    (5, 2, 'Customer signs off', FALSE)
) AS x(section_order, display_order, title, photo_required)
WHERE s.display_order = x.section_order;

-- Aircon Services
WITH t AS (
    INSERT INTO checklist_templates (category_id) VALUES (
        (SELECT id FROM service_categories WHERE slug = 'aircon')
    ) RETURNING id
), s AS (
    INSERT INTO checklist_template_sections (template_id, display_order, title)
    SELECT t.id, x.display_order, x.title FROM t CROSS JOIN (VALUES
        (1, 'Pre-inspection'),
        (2, 'Service work'),
        (3, 'Test run'),
        (4, 'Cleanup + handover')
    ) AS x(display_order, title)
    RETURNING id, display_order
)
INSERT INTO checklist_template_items (section_id, display_order, title, photo_required, is_required)
SELECT s.id, x.display_order, x.title, x.photo_required, TRUE FROM s
CROSS JOIN LATERAL (VALUES
    (1, 1, 'Photo: unit before service', TRUE),
    (1, 2, 'Note: temperature reading + symptoms', FALSE),
    (2, 1, 'Filter cleaned / replaced', FALSE),
    (2, 2, 'Coils inspected and cleaned', FALSE),
    (2, 3, 'Refrigerant level checked', FALSE),
    (3, 1, 'Run test cycle 10 minutes', FALSE),
    (3, 2, 'Confirm cooling at supply vents', FALSE),
    (3, 3, 'Photo: unit running with thermometer', TRUE),
    (4, 1, 'Work area cleaned', FALSE),
    (4, 2, 'Photo: unit after service', TRUE),
    (4, 3, 'Customer signs off', FALSE)
) AS x(section_order, display_order, title, photo_required)
WHERE s.display_order = x.section_order;

-- Plumbing
WITH t AS (
    INSERT INTO checklist_templates (category_id) VALUES (
        (SELECT id FROM service_categories WHERE slug = 'plumbing')
    ) RETURNING id
), s AS (
    INSERT INTO checklist_template_sections (template_id, display_order, title)
    SELECT t.id, x.display_order, x.title FROM t CROSS JOIN (VALUES
        (1, 'Pre-work assessment'),
        (2, 'Repair / installation'),
        (3, 'Leak + pressure test'),
        (4, 'Cleanup + handover')
    ) AS x(display_order, title)
    RETURNING id, display_order
)
INSERT INTO checklist_template_items (section_id, display_order, title, photo_required, is_required)
SELECT s.id, x.display_order, x.title, x.photo_required, TRUE FROM s
CROSS JOIN LATERAL (VALUES
    (1, 1, 'Photo: affected fixture before', TRUE),
    (1, 2, 'Note any related issues observed', FALSE),
    (2, 1, 'Replacement parts installed', FALSE),
    (2, 2, 'Connections sealed', FALSE),
    (3, 1, 'Run water 5 minutes — verify no leaks', FALSE),
    (3, 2, 'Photo: dry joint after run', TRUE),
    (4, 1, 'Work area cleaned, debris removed', FALSE),
    (4, 2, 'Photo: fixture after repair', TRUE),
    (4, 3, 'Customer signs off', FALSE)
) AS x(section_order, display_order, title, photo_required)
WHERE s.display_order = x.section_order;

-- Electrical
WITH t AS (
    INSERT INTO checklist_templates (category_id) VALUES (
        (SELECT id FROM service_categories WHERE slug = 'electrical')
    ) RETURNING id
), s AS (
    INSERT INTO checklist_template_sections (template_id, display_order, title)
    SELECT t.id, x.display_order, x.title FROM t CROSS JOIN (VALUES
        (1, 'Safety + assessment'),
        (2, 'Installation / repair'),
        (3, 'Test'),
        (4, 'Handover')
    ) AS x(display_order, title)
    RETURNING id, display_order
)
INSERT INTO checklist_template_items (section_id, display_order, title, photo_required, is_required)
SELECT s.id, x.display_order, x.title, x.photo_required, TRUE FROM s
CROSS JOIN LATERAL (VALUES
    (1, 1, 'Photo: panel/fixture before', TRUE),
    (1, 2, 'Power isolated at breaker', FALSE),
    (2, 1, 'Wiring per code (gauge + color)', FALSE),
    (2, 2, 'Connections torqued', FALSE),
    (3, 1, 'Power restored — test functionality', FALSE),
    (3, 2, 'Photo: outlet/fixture working', TRUE),
    (4, 1, 'Cover plates secured', FALSE),
    (4, 2, 'Customer signs off', FALSE)
) AS x(section_order, display_order, title, photo_required)
WHERE s.display_order = x.section_order;

-- Carpentry
WITH t AS (
    INSERT INTO checklist_templates (category_id) VALUES (
        (SELECT id FROM service_categories WHERE slug = 'carpentry')
    ) RETURNING id
), s AS (
    INSERT INTO checklist_template_sections (template_id, display_order, title)
    SELECT t.id, x.display_order, x.title FROM t CROSS JOIN (VALUES
        (1, 'Pre-work'),
        (2, 'Construction / repair'),
        (3, 'Finishing'),
        (4, 'Handover')
    ) AS x(display_order, title)
    RETURNING id, display_order
)
INSERT INTO checklist_template_items (section_id, display_order, title, photo_required, is_required)
SELECT s.id, x.display_order, x.title, x.photo_required, TRUE FROM s
CROSS JOIN LATERAL (VALUES
    (1, 1, 'Photo: piece/area before', TRUE),
    (1, 2, 'Confirm measurements with customer', FALSE),
    (2, 1, 'Cuts and joinery completed', FALSE),
    (2, 2, 'Hardware installed', FALSE),
    (3, 1, 'Surfaces sanded smooth', FALSE),
    (3, 2, 'Photo: completed piece', TRUE),
    (4, 1, 'Sawdust + scrap removed', FALSE),
    (4, 2, 'Customer signs off', FALSE)
) AS x(section_order, display_order, title, photo_required)
WHERE s.display_order = x.section_order;

-- Painting
WITH t AS (
    INSERT INTO checklist_templates (category_id) VALUES (
        (SELECT id FROM service_categories WHERE slug = 'painting')
    ) RETURNING id
), s AS (
    INSERT INTO checklist_template_sections (template_id, display_order, title)
    SELECT t.id, x.display_order, x.title FROM t CROSS JOIN (VALUES
        (1, 'Surface prep'),
        (2, 'Painting'),
        (3, 'Cleanup'),
        (4, 'Handover')
    ) AS x(display_order, title)
    RETURNING id, display_order
)
INSERT INTO checklist_template_items (section_id, display_order, title, photo_required, is_required)
SELECT s.id, x.display_order, x.title, x.photo_required, TRUE FROM s
CROSS JOIN LATERAL (VALUES
    (1, 1, 'Photo: walls/surface before', TRUE),
    (1, 2, 'Furniture moved + drop cloths laid', FALSE),
    (1, 3, 'Holes filled, surfaces sanded', FALSE),
    (2, 1, 'Primer coat applied (if needed)', FALSE),
    (2, 2, 'Top coat(s) applied', FALSE),
    (2, 3, 'Edges and trim cut clean', FALSE),
    (3, 1, 'Drop cloths removed, area cleaned', FALSE),
    (3, 2, 'Photo: completed paintwork', TRUE),
    (4, 1, 'Customer signs off', FALSE)
) AS x(section_order, display_order, title, photo_required)
WHERE s.display_order = x.section_order;

-- Pest Control
WITH t AS (
    INSERT INTO checklist_templates (category_id) VALUES (
        (SELECT id FROM service_categories WHERE slug = 'pest-control')
    ) RETURNING id
), s AS (
    INSERT INTO checklist_template_sections (template_id, display_order, title)
    SELECT t.id, x.display_order, x.title FROM t CROSS JOIN (VALUES
        (1, 'Inspection'),
        (2, 'Treatment'),
        (3, 'Safety + handover')
    ) AS x(display_order, title)
    RETURNING id, display_order
)
INSERT INTO checklist_template_items (section_id, display_order, title, photo_required, is_required)
SELECT s.id, x.display_order, x.title, x.photo_required, TRUE FROM s
CROSS JOIN LATERAL (VALUES
    (1, 1, 'Photo: affected areas before treatment', TRUE),
    (1, 2, 'Identify pest species + activity zones', FALSE),
    (2, 1, 'Chemicals applied per label instructions', FALSE),
    (2, 2, 'Bait stations placed (if applicable)', FALSE),
    (2, 3, 'Photo: treatment areas after application', TRUE),
    (3, 1, 'Inform customer of safety wait time', FALSE),
    (3, 2, 'Provide MSDS or product info on request', FALSE),
    (3, 3, 'Customer signs off', FALSE)
) AS x(section_order, display_order, title, photo_required)
WHERE s.display_order = x.section_order;

-- Appliance Repair
WITH t AS (
    INSERT INTO checklist_templates (category_id) VALUES (
        (SELECT id FROM service_categories WHERE slug = 'appliance-repair')
    ) RETURNING id
), s AS (
    INSERT INTO checklist_template_sections (template_id, display_order, title)
    SELECT t.id, x.display_order, x.title FROM t CROSS JOIN (VALUES
        (1, 'Pre-diagnosis'),
        (2, 'Repair'),
        (3, 'Test'),
        (4, 'Handover')
    ) AS x(display_order, title)
    RETURNING id, display_order
)
INSERT INTO checklist_template_items (section_id, display_order, title, photo_required, is_required)
SELECT s.id, x.display_order, x.title, x.photo_required, TRUE FROM s
CROSS JOIN LATERAL (VALUES
    (1, 1, 'Photo: appliance before service', TRUE),
    (1, 2, 'Note model + serial + symptoms', FALSE),
    (2, 1, 'Diagnostic completed', FALSE),
    (2, 2, 'Replacement parts installed', FALSE),
    (3, 1, 'Run full cycle / test functionality', FALSE),
    (3, 2, 'Photo: appliance running normally', TRUE),
    (4, 1, 'Work area cleaned', FALSE),
    (4, 2, 'Customer signs off', FALSE)
) AS x(section_order, display_order, title, photo_required)
WHERE s.display_order = x.section_order;

-- Roofing
WITH t AS (
    INSERT INTO checklist_templates (category_id) VALUES (
        (SELECT id FROM service_categories WHERE slug = 'roofing')
    ) RETURNING id
), s AS (
    INSERT INTO checklist_template_sections (template_id, display_order, title)
    SELECT t.id, x.display_order, x.title FROM t CROSS JOIN (VALUES
        (1, 'Safety + assessment'),
        (2, 'Repair / installation'),
        (3, 'Cleanup'),
        (4, 'Handover')
    ) AS x(display_order, title)
    RETURNING id, display_order
)
INSERT INTO checklist_template_items (section_id, display_order, title, photo_required, is_required)
SELECT s.id, x.display_order, x.title, x.photo_required, TRUE FROM s
CROSS JOIN LATERAL (VALUES
    (1, 1, 'Photo: roof condition before work', TRUE),
    (1, 2, 'Safety harness + ladder secure', FALSE),
    (2, 1, 'Damaged sections removed', FALSE),
    (2, 2, 'New material installed + sealed', FALSE),
    (3, 1, 'Debris removed from roof and ground', FALSE),
    (3, 2, 'Photo: completed work', TRUE),
    (4, 1, 'Customer signs off', FALSE)
) AS x(section_order, display_order, title, photo_required)
WHERE s.display_order = x.section_order;

-- Landscaping
WITH t AS (
    INSERT INTO checklist_templates (category_id) VALUES (
        (SELECT id FROM service_categories WHERE slug = 'landscaping')
    ) RETURNING id
), s AS (
    INSERT INTO checklist_template_sections (template_id, display_order, title)
    SELECT t.id, x.display_order, x.title FROM t CROSS JOIN (VALUES
        (1, 'Pre-service walk'),
        (2, 'Service work'),
        (3, 'Cleanup + handover')
    ) AS x(display_order, title)
    RETURNING id, display_order
)
INSERT INTO checklist_template_items (section_id, display_order, title, photo_required, is_required)
SELECT s.id, x.display_order, x.title, x.photo_required, TRUE FROM s
CROSS JOIN LATERAL (VALUES
    (1, 1, 'Photo: yard/garden before', TRUE),
    (1, 2, 'Confirm scope with customer', FALSE),
    (2, 1, 'Lawn mowed / trimmed', FALSE),
    (2, 2, 'Pruning + weeding completed', FALSE),
    (3, 1, 'Clippings + debris bagged', FALSE),
    (3, 2, 'Photo: completed work', TRUE),
    (3, 3, 'Customer signs off', FALSE)
) AS x(section_order, display_order, title, photo_required)
WHERE s.display_order = x.section_order;

COMMIT;
