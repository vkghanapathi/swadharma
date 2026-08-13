# Swadharma Dharmik Services — FSP Platform Specification

**Website:** swadharmaservices.in · **Project owner:** Dharma Poshanam · **Operator / developer:** ShukaTech.com · **Material supply partner:** Dravya4u.com
**Version:** 1.0 · **Date:** 12 August 2026 · **Status:** For technical review by ShukaTech

---

## 1. Purpose & Scope

The Swadharma platform connects **devotees** with empaneled **Freelance Service Professionals (FSPs)** for dharmic services. This document specifies:

1. The **FSP Registration Form** (web, at swadharmaservices.in) — delivered separately as `fsp-registration-form.html`.
2. The **Swadharma Mobile App** (devotee side and FSP side).
3. The **database** required to run registration, empanelment, matching, booking, and payments.

### Service categories (v1)

| Code | Category | Notes |
|---|---|---|
| `purohita` | Purohita | Gṛhya karmas, pūjās, homas, saṁskāras |
| `archaka` | Archaka | Temple/āgama worship |
| `veda_parayana` | Veda Pārāyaṇa | Pārāyaṇa, svasti vācana |
| `pachaka` | Pāchaka (Cook) | Madi vanta, naivedya, event catering |
| `helper` | Helper / Paricāraka | Ritual setup, dravya arrangement |
| `bhokta` | Bhoktā | Brāhmaṇa bhojana for śrāddha etc. |
| `apara_karma` | Apara Karma | Last rites through 12th day, māsikas |
| `event_coordinator` | Event Coordinator | End-to-end function management |
| `temple_manager` | Temple Manager | Long-term placement oriented |

Categories are a lookup table (`service_categories`), so new verticals can be added without schema change.

---

## 2. Actors

| Actor | Description |
|---|---|
| **Devotee** | End customer booking services through the app |
| **FSP** | Empaneled professional receiving and fulfilling bookings |
| **Ops / Empanelment team** | Dharma Poshanam staff conducting verification calls and interviews, managing disputes |
| **Institution** | Temple / maṭha placing long-term staffing requests |
| **Dravya4u franchisee** | An FSP who additionally stocks/delivers sāmagri kits |

---

## 3. Location-Privacy Model (core design rule)

This rule must be enforced at API level, not just UI:

1. **At registration**, the FSP's **PIN/ZIP only** enters the matching system. The PIN is geocoded to a centroid (`lat`, `lng`) via a `pin_geocodes` reference table.
2. **Matching and distance** are calculated PIN-centroid to PIN-centroid (devotee event PIN ↔ FSP home PIN), using haversine distance. Devotees see FSP city + approximate distance band (e.g., "within 10 km"), never the address.
3. **On the day of the event** (configurable: from `T-12h`), the app reveals the exact event address/geo-pin to the assigned FSP, and live ETA status to the devotee. This is implemented as a time-gated field in the booking API response (`event_location_visible_from` timestamp).
4. FSP residential address is visible only to Ops, never to devotees.

---

## 4. Mobile App Specification

### 4.1 Architecture

- **Client:** Flutter (single codebase → Android + iOS), **two app targets** from one repo:
  - **Swadharma** (devotee app)
  - **Swadharma Pro** (FSP app)
  A shared `core` package holds models, API client, auth, and design system. Two targets keep store listings, notification streams, and UX focused; role confusion is eliminated.
- **Backend:** Node.js (TypeScript) on **GCP Cloud Run**; REST API `api.swadharmaservices.in/api/v1`.
- **Database:** **Cloud SQL (PostgreSQL 16)** for transactional data; **Firestore** only for live-state (FSP online status, booking-day live location/ETA); **Cloud Storage** for documents/photos.
- **Auth:** Firebase Authentication — phone OTP primary, email fallback. JWT verified in backend middleware. Roles claimed server-side (`devotee`, `fsp`, `ops`, `admin`).
- **Notifications:** FCM push + WhatsApp Business API (booking confirmations) + SMS fallback.
- **Payments:** Razorpay Route (India) and Stripe Connect (US/T&T) — split payments: platform commission retained, FSP payout to linked account. Payout ledger in Postgres.
- **Pañcāṅga service:** internal microservice exposing tithi/nakṣatra/muhūrta lookups for booking-date guidance (region-aware; already scoped in the Swadharma marketplace concept spec).

### 4.2 Swadharma Pro (FSP app) — features

| # | Feature | Detail |
|---|---|---|
| 1 | Onboarding & empanelment tracker | Status timeline: Submitted → Verification Call → Interview → Empaneled. Document upload (ID, photo, certificates) with camera capture. |
| 2 | Profile management | Services, bio, languages, śākhā/sampradāya, photos; edits above a threshold re-enter Ops review. |
| 3 | Availability calendar | Weekly template (days × slots from registration) + date-level overrides/blocks; long-term-placement flag toggle. |
| 4 | Booking inbox | New request → Accept / Decline (with reason) within TTL (default 4 h); auto-reassign on expiry. |
| 5 | Booking detail | Service, date, muhūrta window, devotee first name, distance band, dakṣiṇā/fee, sāmagri responsibility (devotee-arranged / Dravya4u kit / FSP-arranged). **Exact address unlocks on event day.** |
| 6 | Day-of-event mode | Address + map deep-link revealed; "Started / Reached / Completed" status buttons feed devotee's live view. |
| 7 | Earnings & payouts | Per-booking earnings, payout schedule, TDS/1099 summaries, downloadable statements. |
| 8 | Dravya4u franchise module | Visible only to franchisees: kit catalogue, stock declaration, kit-fulfilment orders attached to bookings, franchise margin ledger. |
| 9 | Ratings & feedback | View devotee ratings; respond once per review. |
| 10 | Long-term placement board | Institution postings (temple manager, resident archaka, cook); apply in-app. |

### 4.3 Swadharma (devotee app) — features

| # | Feature | Detail |
|---|---|---|
| 1 | Service discovery | Browse by category → sub-service (e.g., Gṛhapraveśa, Satyanārāyaṇa Pūjā, Apara Karma package). |
| 2 | Muhūrta-aware booking | Date picker with pañcāṅga hints; apara karma flow supports urgent same-day matching. |
| 3 | Matching | Enter event PIN → ranked FSP cards (name, photo, experience band, languages, rating, distance band, fee). |
| 4 | Sāmagri option | Add a Dravya4u kit at checkout (fulfilled by franchisee FSP or courier). |
| 5 | Payments | Advance/full payment; refunds per cancellation policy. |
| 6 | Event-day tracking | FSP status (Started/Reached), masked calling (number-bridged, numbers not exposed). |
| 7 | Ratings | Post-completion rating + review. |
| 8 | Multi-region | India / USA / Trinidad & Tobago: currency, pañcāṅga region, payment rails switch by country. |

### 4.4 Ops console (web, internal)

Empanelment queue (verification-call scheduling, interview scheduling, approve/reject/hold with notes), FSP directory, booking monitor, dispute handling, payout approval, Dravya4u franchisee management, category/fee configuration. Built as a simple React admin on the same API.

---

## 5. Empanelment Workflow (state machine)

```
SUBMITTED ──► VERIFICATION_CALL_PENDING ──► VERIFICATION_PASSED ──► INTERVIEW_SCHEDULED
                        │                            │                      │
                        ▼                            ▼                      ▼
                   UNREACHABLE (3 attempts)     VERIFICATION_FAILED     INTERVIEW_DONE
                        │                            │                      │
                        ▼                            ▼              ┌───────┴───────┐
                     EXPIRED                      REJECTED          ▼               ▼
                                                                EMPANELED        REJECTED / ON_HOLD
EMPANELED ──► SUSPENDED / DEACTIVATED (misconduct, inactivity, own request)
```

Every transition is written to `empanelment_events` (actor, timestamp, notes) for auditability. Verification call and interview outcomes are structured records, not free text only.

---

## 6. Database Schema (PostgreSQL)

Conventions: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `created_at`/`updated_at TIMESTAMPTZ` on every table (omitted below for brevity). Enums shown inline.

### 6.1 Identity & profiles

```sql
users (
  id UUID PK,
  phone TEXT UNIQUE NOT NULL,          -- E.164
  email TEXT,
  role TEXT CHECK (role IN ('devotee','fsp','ops','admin')),
  firebase_uid TEXT UNIQUE,
  country CHAR(2) NOT NULL,            -- IN / US / TT
  status TEXT DEFAULT 'active'         -- active | suspended | deleted
)

fsp_profiles (
  id UUID PK,
  user_id UUID FK -> users UNIQUE,
  full_name TEXT NOT NULL,
  dob DATE,
  whatsapp TEXT,
  address TEXT,                        -- Ops-only visibility
  city TEXT NOT NULL,
  pin_zip TEXT NOT NULL,               -- matching key
  photo_url TEXT,
  bio TEXT,
  experience_band TEXT,                -- '<2','2-5','5-10','10-20','20+'
  veda_shakha TEXT,
  sampradaya TEXT,
  training_institution TEXT,
  languages TEXT[],
  specializations TEXT,
  certifications TEXT,
  affiliated BOOLEAN,
  affiliation_details TEXT,
  affiliation_restriction TEXT,        -- none | partial | na
  passport_held BOOLEAN,
  long_term_placement TEXT,            -- yes | no | maybe
  dravya4u_interest TEXT,              -- yes | info | no
  empanelment_status TEXT NOT NULL DEFAULT 'SUBMITTED',
  rating_avg NUMERIC(3,2),
  rating_count INT DEFAULT 0
)

fsp_services (                          -- M:N profile ↔ category
  fsp_id UUID FK -> fsp_profiles,
  category_id INT FK -> service_categories,
  approved BOOLEAN DEFAULT false,       -- Ops approves per category at interview
  PRIMARY KEY (fsp_id, category_id)
)

service_categories (
  id SERIAL PK, code TEXT UNIQUE, name TEXT, name_sa TEXT, active BOOLEAN
)

fsp_documents (
  id UUID PK, fsp_id UUID FK,
  doc_type TEXT,                        -- id_proof | photo | certificate | passport | bank_proof
  storage_url TEXT, verified BOOLEAN DEFAULT false, verified_by UUID FK -> users
)
```

### 6.2 Empanelment

```sql
empanelment_events (
  id UUID PK, fsp_id UUID FK,
  from_status TEXT, to_status TEXT,
  actor_id UUID FK -> users, notes TEXT, occurred_at TIMESTAMPTZ
)

verification_calls (
  id UUID PK, fsp_id UUID FK, scheduled_at TIMESTAMPTZ, attempt_no INT,
  outcome TEXT,                         -- passed | failed | unreachable
  checklist JSONB,                      -- identity, category claims, availability confirmed
  caller_id UUID FK -> users
)

empanelment_interviews (
  id UUID PK, fsp_id UUID FK, mode TEXT, -- in_person | video
  scheduled_at TIMESTAMPTZ, panel TEXT,
  category_assessments JSONB,           -- per-category pass/fail + grade
  outcome TEXT, notes TEXT
)
```

### 6.3 Availability & matching

```sql
fsp_availability (
  id UUID PK, fsp_id UUID FK,
  day_of_week SMALLINT,                 -- 0–6
  slot TEXT,                            -- brahma_muhurta | morning | afternoon | evening
  UNIQUE (fsp_id, day_of_week, slot)
)

fsp_availability_overrides (
  id UUID PK, fsp_id UUID FK, on_date DATE, slot TEXT, available BOOLEAN
)

fsp_travel (
  fsp_id UUID PK FK,
  within_city BOOLEAN, outside_city BOOLEAN,
  outside_state BOOLEAN, international BOOLEAN,
  notice_period TEXT                    -- same_day | 1d | 2_3d | 1w+
)

pin_geocodes (
  pin_zip TEXT, country CHAR(2), lat NUMERIC(9,6), lng NUMERIC(9,6),
  city TEXT, state TEXT, PRIMARY KEY (pin_zip, country)
)
-- Matching query: filter by approved category + availability + travel scope,
-- order by haversine(fsp_pin_centroid, event_pin_centroid), rating_avg DESC.
```

### 6.4 Devotees & bookings

```sql
devotee_profiles (
  id UUID PK, user_id UUID FK UNIQUE, full_name TEXT, gotra TEXT, notes TEXT
)

bookings (
  id UUID PK,
  booking_ref TEXT UNIQUE,              -- SWD-2026-000123
  devotee_id UUID FK, fsp_id UUID FK NULL,
  category_id INT FK, sub_service TEXT,
  event_date DATE, slot TEXT, muhurta_window TEXT,
  event_pin TEXT, event_country CHAR(2),
  event_address TEXT,                   -- gated: served to FSP only when
  event_geo POINT,                      --   now() >= event_location_visible_from
  event_location_visible_from TIMESTAMPTZ,
  samagri_mode TEXT,                    -- devotee | dravya4u_kit | fsp
  fee_amount NUMERIC(10,2), currency CHAR(3),
  status TEXT                           -- requested | offered | accepted | declined |
)                                       -- confirmed | in_progress | completed | cancelled | disputed

booking_offers (                        -- offer/TTL fan-out to candidate FSPs
  id UUID PK, booking_id UUID FK, fsp_id UUID FK,
  offered_at TIMESTAMPTZ, expires_at TIMESTAMPTZ,
  response TEXT                         -- pending | accepted | declined | expired
)

booking_status_events (
  id UUID PK, booking_id UUID FK, status TEXT, actor_id UUID FK, occurred_at TIMESTAMPTZ
)                                       -- includes day-of 'started' / 'reached' / 'completed'

ratings (
  id UUID PK, booking_id UUID FK UNIQUE, fsp_id UUID FK, devotee_id UUID FK,
  stars SMALLINT CHECK (stars BETWEEN 1 AND 5), review TEXT, fsp_response TEXT
)
```

### 6.5 Payments & franchise

```sql
payments (
  id UUID PK, booking_id UUID FK, gateway TEXT,       -- razorpay | stripe
  gateway_ref TEXT, amount NUMERIC(10,2), currency CHAR(3),
  kind TEXT,                                          -- advance | balance | refund
  status TEXT
)

payouts (
  id UUID PK, fsp_id UUID FK, booking_id UUID FK,
  gross NUMERIC(10,2), commission NUMERIC(10,2), tds NUMERIC(10,2),
  net NUMERIC(10,2), currency CHAR(3), gateway_ref TEXT, status TEXT
)

dravya4u_franchisees (
  fsp_id UUID PK FK, status TEXT,                     -- interested | onboarded | active | inactive
  territory_pins TEXT[], onboarded_at TIMESTAMPTZ
)

kit_orders (
  id UUID PK, booking_id UUID FK, franchisee_id UUID FK NULL,
  kit_code TEXT, amount NUMERIC(10,2), fulfilment TEXT,  -- franchisee | courier
  status TEXT
)
```

### 6.6 Long-term placements & consents

```sql
institutions (
  id UUID PK, name TEXT, kind TEXT, city TEXT, country CHAR(2), contact JSONB, verified BOOLEAN
)

placements (
  id UUID PK, institution_id UUID FK, category_id INT FK,
  title TEXT, description TEXT, location TEXT, compensation TEXT,
  status TEXT                            -- open | filled | closed
)

placement_applications (
  id UUID PK, placement_id UUID FK, fsp_id UUID FK, status TEXT, notes TEXT
)

consents (
  id UUID PK, user_id UUID FK,
  consent_type TEXT,                     -- pin_sharing | verification | communication | declaration
  version TEXT, granted BOOLEAN, granted_at TIMESTAMPTZ, ip TEXT
)
```

**Firestore (live-state only):** `presence/{fspId}` (online, last_seen), `live/{bookingId}` (fsp_status, eta, updated_at). All durable records stay in Postgres.

---

## 7. API Surface (v1, selected)

```
POST /api/v1/fsp/applications           ← target of the web registration form
GET  /api/v1/fsp/me                     profile + empanelment status
PUT  /api/v1/fsp/me/availability
GET  /api/v1/fsp/me/offers              pending booking offers
POST /api/v1/fsp/offers/:id/respond     accept | decline
GET  /api/v1/fsp/bookings/:id           (address fields gated by visible_from)
POST /api/v1/fsp/bookings/:id/status    started | reached | completed

POST /api/v1/devotee/bookings           create request (category, date, PIN…)
GET  /api/v1/devotee/match?pin=&cat=&date=   ranked FSP cards
POST /api/v1/devotee/bookings/:id/pay
POST /api/v1/devotee/bookings/:id/rate

POST /api/v1/ops/fsp/:id/verification-call
POST /api/v1/ops/fsp/:id/interview
POST /api/v1/ops/fsp/:id/transition     state-machine guarded
```

The web form (`fsp-registration-form.html`) already assembles the exact JSON payload for `POST /api/v1/fsp/applications` — see the `payload` object in its script block.

---

## 8. Non-Functional Requirements

- **Data protection:** India DPDP Act 2023 consent records (the `consents` table), US state privacy baselines; devotee/FSP phone numbers bridged (masked calling), never exposed to each other.
- **Security:** JWT + role claims; row-level checks so an FSP reads only own bookings; address gating enforced server-side; document bucket private with signed URLs; audit trails (`*_events` tables).
- **Availability:** Cloud Run min-instances 1 for API; Cloud SQL HA in production.
- **Localization:** English UI at launch; string architecture ready for Kannada, Telugu, Tamil, Hindi.
- **Analytics:** booking funnel, offer-acceptance rate, FSP utilization, category demand by PIN.

---

## 9. Phased Delivery

| Phase | Scope | Target |
|---|---|---|
| **P0** | Web registration form live on swadharmaservices.in + `POST /applications` + Ops empanelment console + verification/interview workflow | 4–6 weeks |
| **P1** | Swadharma Pro (FSP app): profile, availability, offers, day-of mode; manual booking entry by Ops | +8 weeks |
| **P2** | Swadharma (devotee app): discovery, matching, payments (Razorpay India first) | +10 weeks |
| **P3** | Dravya4u franchise module, kit checkout, long-term placement board, Stripe (US/T&T) | +8 weeks |

---

*Prepared for Dharma Poshanam · to be executed by ShukaTech.com under the existing software-development MoU (IP vesting in Dharma Poshanam).*
