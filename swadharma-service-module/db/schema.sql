-- =====================================================================
-- Swadharma Service Module (SSM) — PostgreSQL 16 schema, v1.6
-- v1.1: multi-tenancy (Org channel) — tenants, captive/network separation
-- v1.2: notifications_outbox (email + in-app + WhatsApp/SMS fan-out)
-- v1.4: tenants.listed_in_marketplace — devotee app dual-channel discovery
--       (captive = data isolation; marketplace listing is a separate choice)
-- v1.5: commercial model — 6% referral fee; facilitation +4-5%; fee_invoices
-- v1.6: recurring events (booking_series); devotee credit ledger
--       (credit-on-cancellation, not refund); published service fee schedule;
--       offline FSP payouts (cheque/cash) with acknowledgment
-- Project: Dharma Poshanam · Operator: ShukaTech.com
-- Run: psql swadharma -f db/schema.sql
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- 1. Identity & profiles
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         TEXT UNIQUE NOT NULL,                    -- E.164
  email         TEXT,
  role          TEXT NOT NULL CHECK (role IN ('devotee','fsp','ops','admin')),
  firebase_uid  TEXT UNIQUE,
  country       CHAR(2) NOT NULL,                        -- IN / US / TT
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','suspended','deleted')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Organizations on the Org channel (e.g., DattaMukti → swadharma.dattamukti.in).
-- mode:
--   captive : tenant's bookings (and org-attached FSPs) visible ONLY to the
--             tenant and platform Ops — never to other tenants or the open network
--   network : tenant participates fully in the shared FSP pool
--   hybrid  : captive bookings, but may draw on network FSPs when own roster
--             cannot fulfil (per-booking opt-in)
CREATE TABLE tenants (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT UNIQUE NOT NULL,           -- 'dattamukti'
  name           TEXT NOT NULL,
  domain         TEXT UNIQUE,                    -- swadharma.dattamukti.in
  mode           TEXT NOT NULL DEFAULT 'captive'
                 CHECK (mode IN ('captive','network','hybrid')),
  api_key_hash   TEXT,
  revenue_share  JSONB,                          -- commission/split config per tenant
  listed_in_marketplace BOOLEAN NOT NULL DEFAULT true,
                 -- Show this org's services in the Swadharma devotee app.
                 -- Independent of mode: a captive tenant can be listed
                 -- (devotee books the ORG's service; org assigns an FSP from
                 -- its roster later, so bookings.fsp_id starts NULL).
  status         TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','suspended','offboarded')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE service_categories (
  id       SERIAL PRIMARY KEY,
  code     TEXT UNIQUE NOT NULL,
  name     TEXT NOT NULL,
  name_sa  TEXT,
  active   BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO service_categories (code, name, name_sa) VALUES
  ('purohita',          'Purohita',           'पुरोहितः'),
  ('archaka',           'Archaka',            'अर्चकः'),
  ('veda_parayana',     'Veda Pārāyaṇa',      'वेदपारायणम्'),
  ('pachaka',           'Pāchaka (Cook)',     'पाचकः'),
  ('helper',            'Helper / Paricāraka','परिचारकः'),
  ('bhokta',            'Bhoktā',             'भोक्ता'),
  ('apara_karma',       'Apara Karma',        'अपरकर्म'),
  ('event_coordinator', 'Event Coordinator',  'कार्यक्रमसंयोजकः'),
  ('temple_manager',    'Temple Manager',     'देवालयप्रबन्धकः');

CREATE TABLE fsp_profiles (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID UNIQUE NOT NULL REFERENCES users(id),
  home_tenant_id           UUID REFERENCES tenants(id),   -- NULL = independent freelancer (Pro channel)
  network_visible          BOOLEAN NOT NULL DEFAULT true, -- false = captive to home tenant only
  full_name                TEXT NOT NULL,
  dob                      DATE,
  whatsapp                 TEXT,
  address                  TEXT,                          -- Ops-only visibility
  city                     TEXT NOT NULL,
  pin_zip                  TEXT NOT NULL,                 -- matching key
  photo_url                TEXT,
  bio                      TEXT,
  experience_band          TEXT CHECK (experience_band IN ('<2','2-5','5-10','10-20','20+')),
  veda_shakha              TEXT,
  sampradaya               TEXT,
  training_institution     TEXT,
  languages                TEXT[],
  specializations          TEXT,
  certifications           TEXT,
  affiliated               BOOLEAN,
  affiliation_details      TEXT,
  affiliation_restriction  TEXT CHECK (affiliation_restriction IN ('none','partial','na')),
  passport_held            BOOLEAN,
  long_term_placement      TEXT CHECK (long_term_placement IN ('yes','no','maybe')),
  dravya4u_interest        TEXT CHECK (dravya4u_interest IN ('yes','info','no')),
  empanelment_status       TEXT NOT NULL DEFAULT 'SUBMITTED',
  rating_avg               NUMERIC(3,2),
  rating_count             INT NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fsp_pin ON fsp_profiles (pin_zip);
CREATE INDEX idx_fsp_status ON fsp_profiles (empanelment_status);

CREATE TABLE fsp_services (
  fsp_id       UUID NOT NULL REFERENCES fsp_profiles(id),
  category_id  INT  NOT NULL REFERENCES service_categories(id),
  approved     BOOLEAN NOT NULL DEFAULT false,            -- per-category, at interview
  PRIMARY KEY (fsp_id, category_id)
);

CREATE TABLE fsp_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fsp_id       UUID NOT NULL REFERENCES fsp_profiles(id),
  doc_type     TEXT NOT NULL CHECK (doc_type IN
               ('id_proof','photo','certificate','passport','bank_proof')),
  storage_url  TEXT NOT NULL,
  verified     BOOLEAN NOT NULL DEFAULT false,
  verified_by  UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2. Empanelment workflow
-- ---------------------------------------------------------------------
CREATE TABLE empanelment_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fsp_id       UUID NOT NULL REFERENCES fsp_profiles(id),
  from_status  TEXT,
  to_status    TEXT NOT NULL,
  actor_id     UUID REFERENCES users(id),
  notes        TEXT,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE verification_calls (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fsp_id        UUID NOT NULL REFERENCES fsp_profiles(id),
  scheduled_at  TIMESTAMPTZ,
  attempt_no    INT NOT NULL DEFAULT 1,
  outcome       TEXT CHECK (outcome IN ('passed','failed','unreachable')),
  checklist     JSONB,
  caller_id     UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE empanelment_interviews (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fsp_id                UUID NOT NULL REFERENCES fsp_profiles(id),
  mode                  TEXT CHECK (mode IN ('in_person','video')),
  scheduled_at          TIMESTAMPTZ,
  panel                 TEXT,
  category_assessments  JSONB,
  outcome               TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 3. Availability & matching
-- ---------------------------------------------------------------------
CREATE TABLE fsp_availability (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fsp_id       UUID NOT NULL REFERENCES fsp_profiles(id),
  day_of_week  SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  slot         TEXT NOT NULL CHECK (slot IN
               ('brahma_muhurta','morning','afternoon','evening')),
  UNIQUE (fsp_id, day_of_week, slot)
);

CREATE TABLE fsp_availability_overrides (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fsp_id     UUID NOT NULL REFERENCES fsp_profiles(id),
  on_date    DATE NOT NULL,
  slot       TEXT NOT NULL,
  available  BOOLEAN NOT NULL
);

CREATE TABLE fsp_travel (
  fsp_id         UUID PRIMARY KEY REFERENCES fsp_profiles(id),
  within_city    BOOLEAN NOT NULL DEFAULT false,
  outside_city   BOOLEAN NOT NULL DEFAULT false,
  outside_state  BOOLEAN NOT NULL DEFAULT false,
  international  BOOLEAN NOT NULL DEFAULT false,
  notice_period  TEXT CHECK (notice_period IN ('same_day','1d','2_3d','1w+'))
);

CREATE TABLE pin_geocodes (
  pin_zip  TEXT NOT NULL,
  country  CHAR(2) NOT NULL,
  lat      NUMERIC(9,6) NOT NULL,
  lng      NUMERIC(9,6) NOT NULL,
  city     TEXT,
  state    TEXT,
  PRIMARY KEY (pin_zip, country)
);

-- ---------------------------------------------------------------------
-- 4. Devotees & bookings
-- ---------------------------------------------------------------------
CREATE TABLE devotee_profiles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID UNIQUE NOT NULL REFERENCES users(id),
  full_name  TEXT NOT NULL,
  gotra      TEXT,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Recurring events (nitya sevas, weekly/monthly programs). Each occurrence
-- is materialized as its own bookings row, so one postponed occurrence
-- converts to credit without disturbing the series.
CREATE TABLE booking_series (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  devotee_id   UUID NOT NULL REFERENCES devotee_profiles(id),
  tenant_id    UUID REFERENCES tenants(id),
  category_id  INT NOT NULL REFERENCES service_categories(id),
  sub_service  TEXT,
  rrule        TEXT NOT NULL,           -- iCal RRULE, e.g. FREQ=MONTHLY;BYMONTHDAY=11
  frequency    TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly','yearly','tithi')),
                                        -- 'tithi': pancanga-based recurrence (e.g., every
                                        -- masa-sraddha tithi) resolved by the pancanga service
  start_date   DATE NOT NULL,
  end_date     DATE,
  status       TEXT NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','paused','completed','cancelled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bookings (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_ref                  TEXT UNIQUE NOT NULL,          -- SWD-2026-000123
  tenant_id                    UUID REFERENCES tenants(id),   -- NULL = direct platform booking;
                                                              -- set = originated on tenant channel.
                                                              -- Captive tenants: row visible only to
                                                              -- tenant + Ops (enforce via RLS policy)
  devotee_id                   UUID NOT NULL REFERENCES devotee_profiles(id),
  series_id                    UUID REFERENCES booking_series(id),  -- NULL = one-time event
  fsp_id                       UUID REFERENCES fsp_profiles(id),
  category_id                  INT NOT NULL REFERENCES service_categories(id),
  sub_service                  TEXT,
  event_date                   DATE NOT NULL,
  slot                         TEXT,
  muhurta_window               TEXT,
  event_pin                    TEXT NOT NULL,
  event_country                CHAR(2) NOT NULL,
  event_address                TEXT,      -- served to FSP only when now() >= visible_from
  event_geo                    POINT,
  event_location_visible_from  TIMESTAMPTZ,
  samagri_mode                 TEXT CHECK (samagri_mode IN ('devotee','dravya4u_kit','fsp')),
  settlement_mode              TEXT NOT NULL DEFAULT 'referral'
                               CHECK (settlement_mode IN ('referral','facilitated')),
                               -- referral    : devotee pays FSP/Org directly;
                               --               platform invoices 6% referral fee
                               -- facilitated : platform collects via DPI (US) /
                               --               DPT (IN) rails, deducts 10-11%, pays out
  referral_fee_pct             NUMERIC(4,2) NOT NULL DEFAULT 6.00,
  facilitation_fee_pct         NUMERIC(4,2),      -- 4.00-5.00 when facilitated, else NULL
  fee_amount                   NUMERIC(10,2),
  currency                     CHAR(3),
  status                       TEXT NOT NULL DEFAULT 'requested'
                               CHECK (status IN ('requested','offered','accepted','declined',
                                     'confirmed','in_progress','completed','cancelled','disputed')),
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bookings_date ON bookings (event_date);
CREATE INDEX idx_bookings_fsp ON bookings (fsp_id);

CREATE TABLE booking_offers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES bookings(id),
  fsp_id      UUID NOT NULL REFERENCES fsp_profiles(id),
  offered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  response    TEXT NOT NULL DEFAULT 'pending'
              CHECK (response IN ('pending','accepted','declined','expired'))
);

CREATE TABLE booking_status_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES bookings(id),
  status      TEXT NOT NULL,      -- incl. day-of: started | reached | completed
  actor_id    UUID REFERENCES users(id),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ratings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    UUID UNIQUE NOT NULL REFERENCES bookings(id),
  fsp_id        UUID NOT NULL REFERENCES fsp_profiles(id),
  devotee_id    UUID NOT NULL REFERENCES devotee_profiles(id),
  stars         SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  review        TEXT,
  fsp_response  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 5. Payments & Dravya4u franchise
-- ---------------------------------------------------------------------
CREATE TABLE payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   UUID NOT NULL REFERENCES bookings(id),
  gateway      TEXT NOT NULL CHECK (gateway IN ('razorpay','stripe')),
  gateway_ref  TEXT,
  amount       NUMERIC(10,2) NOT NULL,
  currency     CHAR(3) NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('advance','balance','refund')),
  status       TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payouts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fsp_id       UUID NOT NULL REFERENCES fsp_profiles(id),
  booking_id   UUID NOT NULL REFERENCES bookings(id),
  gross        NUMERIC(10,2) NOT NULL,
  commission   NUMERIC(10,2) NOT NULL,
  tds          NUMERIC(10,2) NOT NULL DEFAULT 0,
  net          NUMERIC(10,2) NOT NULL,
  currency     CHAR(3) NOT NULL,
  gateway_ref  TEXT,
  method       TEXT NOT NULL DEFAULT 'cheque'
               CHECK (method IN ('cheque','cash','bank_transfer')),
               -- FSP payout is offline by default (cheque or cash, mutually
               -- convenient), at the published service fee
  acknowledged_at    TIMESTAMPTZ,       -- FSP acknowledgment of receipt
  acknowledgment_ref TEXT,              -- cheque no. / signed voucher / photo ref
  status       TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Published service fee per category/sub-service and region. Platform pays
-- the FSP this published fee. Voluntary additional daksina from the devotee
-- is permitted; demanding above the published fee is grounds for suspension.
CREATE TABLE service_fee_schedule (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id    INT NOT NULL REFERENCES service_categories(id),
  sub_service    TEXT,
  country        CHAR(2) NOT NULL,
  currency       CHAR(3) NOT NULL,
  published_fee  NUMERIC(10,2) NOT NULL,
  effective_from DATE NOT NULL,
  active         BOOLEAN NOT NULL DEFAULT true
);

-- Devotee credit ledger. Amounts paid to the app convert to CREDIT on
-- postponement/cancellation (not cash refund); credit applies to any
-- future booking. Cash refunds are Ops-exception entries only.
CREATE TABLE credit_ledger (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  devotee_id  UUID NOT NULL REFERENCES devotee_profiles(id),
  booking_id  UUID REFERENCES bookings(id),
  entry_type  TEXT NOT NULL CHECK (entry_type IN ('credit','debit')),
  reason      TEXT NOT NULL CHECK (reason IN
              ('cancellation','postponement','applied_to_booking',
               'ops_adjustment','exceptional_refund')),
  amount      NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  currency    CHAR(3) NOT NULL,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_credit_devotee ON credit_ledger (devotee_id, currency);
-- balance = SUM(credit) - SUM(debit) per devotee per currency

CREATE TABLE dravya4u_franchisees (
  fsp_id          UUID PRIMARY KEY REFERENCES fsp_profiles(id),
  status          TEXT NOT NULL DEFAULT 'interested'
                  CHECK (status IN ('interested','onboarded','active','inactive')),
  territory_pins  TEXT[],
  onboarded_at    TIMESTAMPTZ
);

CREATE TABLE kit_orders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     UUID NOT NULL REFERENCES bookings(id),
  franchisee_id  UUID REFERENCES dravya4u_franchisees(fsp_id),
  kit_code       TEXT NOT NULL,
  amount         NUMERIC(10,2) NOT NULL,
  fulfilment     TEXT CHECK (fulfilment IN ('franchisee','courier')),
  status         TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 6. Long-term placements & consents
-- ---------------------------------------------------------------------
CREATE TABLE institutions (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),   -- set if institution operates an Org-channel tenant
  name      TEXT NOT NULL,
  kind      TEXT,
  city      TEXT,
  country   CHAR(2),
  contact   JSONB,
  verified  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE placements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  category_id     INT NOT NULL REFERENCES service_categories(id),
  title           TEXT NOT NULL,
  description     TEXT,
  location        TEXT,
  compensation    TEXT,
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','filled','closed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE placement_applications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id  UUID NOT NULL REFERENCES placements(id),
  fsp_id        UUID NOT NULL REFERENCES fsp_profiles(id),
  status        TEXT NOT NULL DEFAULT 'applied',
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE consents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  consent_type  TEXT NOT NULL CHECK (consent_type IN
                ('pin_sharing','verification','communication','declaration')),
  version       TEXT NOT NULL DEFAULT 'v1',
  granted       BOOLEAN NOT NULL,
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip            TEXT
);

-- ---------------------------------------------------------------------
-- 7. Tenancy separation enforcement (captive model)
-- ---------------------------------------------------------------------
CREATE INDEX idx_bookings_tenant ON bookings (tenant_id);
CREATE INDEX idx_fsp_home_tenant ON fsp_profiles (home_tenant_id);

-- Row-Level Security: captive booking rows never leak across tenants.
-- Application sets per-connection context:
--   SET app.tenant_id = '<uuid or empty>'; SET app.role = 'ops'|'tenant'|'fsp'|'devotee';
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY bookings_ops_all ON bookings
  USING (current_setting('app.role', true) IN ('ops','admin'));

CREATE POLICY bookings_tenant_scope ON bookings
  USING (
    current_setting('app.role', true) = 'tenant'
    AND tenant_id::text = current_setting('app.tenant_id', true)
  );

CREATE POLICY bookings_platform_direct ON bookings
  USING (
    current_setting('app.role', true) IN ('devotee','fsp')
    -- participant-level checks (own bookings only) enforced in API layer
  );

-- Matching rule (implemented in API, documented here):
--   candidate FSPs for a booking =
--     FSPs WHERE network_visible = true
--     UNION FSPs WHERE home_tenant_id = booking.tenant_id
--   For mode='captive' tenants: home-roster only, unless mode='hybrid'
--   and the booking explicitly opts into network fulfilment.

-- ---------------------------------------------------------------------
-- 8. Notifications (email + in-app of record; WhatsApp/SMS time-critical)
-- ---------------------------------------------------------------------
CREATE TABLE notifications_outbox (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id),
  booking_id   UUID REFERENCES bookings(id),
  event_type   TEXT NOT NULL,
  channels     TEXT[] NOT NULL,
  payload      JSONB NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','sent','partial','failed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at      TIMESTAMPTZ
);
CREATE INDEX idx_outbox_pending ON notifications_outbox (status) WHERE status = 'pending';

-- ---------------------------------------------------------------------
-- 9. Referral fee invoicing (settlement_mode = 'referral')
-- ---------------------------------------------------------------------
-- Monthly consolidated invoice per FSP or Org for the 6% referral fee on
-- direct-settled bookings. Collection: auto-debit mandate, online payment,
-- or offset against facilitated-booking payouts.
CREATE TABLE fee_invoices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_ref   TEXT UNIQUE NOT NULL,             -- SWD-INV-2026-09-000045
  payer_kind    TEXT NOT NULL CHECK (payer_kind IN ('fsp','tenant')),
  fsp_id        UUID REFERENCES fsp_profiles(id),
  tenant_id     UUID REFERENCES tenants(id),
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  currency      CHAR(3) NOT NULL,
  amount        NUMERIC(10,2) NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','issued','paid','offset','overdue','written_off')),
  issued_at     TIMESTAMPTZ,
  paid_at       TIMESTAMPTZ,
  CHECK ( (payer_kind='fsp' AND fsp_id IS NOT NULL AND tenant_id IS NULL)
       OR (payer_kind='tenant' AND tenant_id IS NOT NULL AND fsp_id IS NULL) )
);

CREATE TABLE fee_invoice_lines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID NOT NULL REFERENCES fee_invoices(id),
  booking_id  UUID NOT NULL REFERENCES bookings(id),
  fee_pct     NUMERIC(4,2) NOT NULL,
  base_amount NUMERIC(10,2) NOT NULL,
  fee_amount  NUMERIC(10,2) NOT NULL
);

-- =====================================================================
-- End of schema v1.6
-- =====================================================================
