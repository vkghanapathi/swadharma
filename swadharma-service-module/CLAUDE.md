# CLAUDE.md — Swadharma Service Module (SSM)

You are building the Swadharma Dharmik Services platform. Read these documents **in order** before writing any code:

1. `README.md` — layout, design rules, phases
2. `docs/swadharma-app-database-spec.md` — system spec (architecture, features, API §7)
3. `docs/tenant-model.md` — Org/Pro channels, captive/network tenancy
4. `docs/platform-delivery.md` — app lineup, rollout order, notifications, live share, commercial model, credits & recurrence
5. `db/schema.sql` — authoritative data model (v1.6, 32 tables). Do not redesign it; extend via migrations only.
6. `api/openapi.yaml` — starter contract. Extend it to cover spec §7 fully; keep it the source of truth for the API.

## Stack (fixed — do not substitute)

- **API:** Node.js 20 + TypeScript, Express or Fastify, on GCP Cloud Run. Base path `/api/v1`.
- **DB:** PostgreSQL 16 (Cloud SQL). Local dev via Docker. Migrations: node-pg-migrate or equivalent, seeded from `db/schema.sql`.
- **Auth:** Firebase Authentication (phone OTP primary); verify ID tokens in middleware; roles via custom claims (`devotee|fsp|ops|admin|tenant`).
- **Live state:** Firestore only for `presence/*` and `live/{bookingId}` (see platform-delivery §3.4). Never write GPS positions to Postgres.
- **Apps:** Flutter, one repo, shared `core` package, two app targets (`swadharma`, `swadharma_pro`). Org channel is a responsive web workspace / PWA — no third native app.
- **Payments:** Stripe Connect (US, DPI merchant of record) first; Razorpay Route (India, DPT) second.

## Non-negotiable guardrails (write tests for each before marking any phase done)

1. **Tenant isolation:** with two seeded tenants, a `tenant`-role connection must be unable to read the other tenant's bookings (RLS, schema §7). Test must attempt the cross-read and assert failure.
2. **Address gating:** `GET /fsp/bookings/:id` must omit `event_address`/`event_geo` until `now() >= event_location_visible_from`. Enforced server-side; test both sides of the boundary.
3. **Location privacy:** matching uses PIN centroids only; devotee responses contain distance *bands*, never FSP addresses; no location trail persisted in Postgres (only status timestamps).
4. **Credit-not-refund:** cancellation/postponement handlers write `credit_ledger` entries; no gateway refund calls in the normal path.
5. **Fee immutability:** `settlement_mode`, `referral_fee_pct`, `facilitation_fee_pct` are stamped on the booking at creation and never updated afterward.
6. **Consents:** every FSP application writes four `consents` rows; applications missing any consent are rejected 400.

## Build order

### Phase P0 (do this first, completely)
1. Docker-compose for local Postgres; apply `db/schema.sql`; seed script (2 tenants incl. `dattamukti`, 3 FSPs, 2 devotees, fee schedule rows).
2. API: `POST /fsp/applications` (validate against openapi FspApplication schema; create users/fsp_profiles/fsp_services/fsp_travel/fsp_availability/consents; status SUBMITTED; return applicationId).
3. Empanelment endpoints (ops): verification-call, interview, state transitions guarded by the state machine in spec §5; every transition → `empanelment_events`.
4. Ops console (React, minimal): empanelment queue, application detail, transition actions.
5. Wire `web/fsp-registration-form.html` fetch() call to the API.
6. Guardrail tests 1, 6 + application validation tests. CI: lint, typecheck, test.

### Phase P1 — Swadharma Pro app
Availability template + overrides, booking offers inbox with TTL expiry job, day-of mode (venue unlock, journey states → `booking_status_events`, Firestore live doc), earnings view. Guardrail tests 2, 3.

### Phase P2 — Swadharma devotee app + payments
Dual-channel discovery (Professional cards + Organization cards where `listed_in_marketplace`), matching endpoint (availability ∩ travel scope ∩ category, ranked by distance band + rating), booking creation (one-time and `booking_series` incl. tithi stub), Stripe Connect collection, credit ledger application at checkout. Guardrail tests 4, 5.

### Phase P3
Razorpay Route, fee_invoices monthly job, Dravya4u module, placements board, notifications_outbox worker (in-app + email; WhatsApp/SMS adapters behind an interface).

## Things you must ask the human for (do not fabricate)

- GCP project ID, Firebase project config, Cloud SQL instance
- Stripe / Razorpay API keys (use test keys until told otherwise)
- WhatsApp Business API credentials (stub the adapter until provided)
- Published service fee amounts (seed with placeholder values marked TODO)
- Pañcāṅga service endpoint (stub `tithi` recurrence resolution behind an interface until provided)

## Conventions

- Every table already has created_at/updated_at semantics — keep them maintained.
- All money in NUMERIC, never floats. Currency always explicit.
- API errors: RFC 7807 problem+json.
- Sanskrit strings in UI: UTF-8 Devanagari, font Noto Serif Devanagari.
- Branding footer on all surfaces: "Swadharma Dharmik Services · A project of Dharma Poshanam · Operated by ShukaTech.com".
- Commit per completed task with descriptive messages; never commit secrets; `.env` stays gitignored.
