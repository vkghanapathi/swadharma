# SSM Tenant Model — Org & Pro Channels

**Version 1.1 · 12 August 2026 · Companion to `swadharma-app-database-spec.md`**

## 1. Two channels, one identity layer

swadharmaservices.in operates a single authentication layer (Firebase Auth) with two registration/login channels:

| Channel | Who | Entry point | What they get |
|---|---|---|---|
| **Swadharma Org** | Institutions — temples, maṭhas, service organizations (e.g., DattaMukti) | swadharmaservices.in/org | Tenant workspace: own branded surface (e.g., swadharma.dattamukti.in), booking desk, own FSP roster, placement postings, tenant admin & staff accounts |
| **Swadharma Pro** | Individual freelance professionals | swadharmaservices.in/pro (registration form) + Swadharma Pro app | Central empanelment, availability, offers, payouts |

**Devotees are channel-free.** A devotee may sign up and book on swadharmaservices.in, on any tenant surface (swadharma.dattamukti.in), or in the Swadharma mobile app — it is the same identity everywhere (`users` is global, no tenant column). Convenience decides the surface; the account follows the devotee.

## 2. Tenancy modes (built-in separation model)

Each Org-channel tenant is created in one of three modes (`tenants.mode`):

| Mode | Bookings | FSP roster | Typical use |
|---|---|---|---|
| **captive** | Private to the tenant. Never visible to other tenants or the open network. | Tenant's own attached FSPs only (`home_tenant_id = tenant`, `network_visible = false`) | Institution running its own priests/cooks under its own brand — **DattaMukti default** |
| **network** | Flow into the shared platform pool | Draws freely on the central empaneled network | Institution acting as a demand aggregator |
| **hybrid** | Captive by default | Own roster first; may opt a specific booking into network fulfilment when the roster cannot serve it | Institution with a small roster wanting overflow coverage |

Direct platform bookings (no tenant) have `bookings.tenant_id = NULL`.

## 3. Data separation guarantees

Separation is enforced at three layers — not just UI:

1. **Database (RLS):** `bookings` has Row-Level Security. A tenant connection (`app.role='tenant'`, `app.tenant_id=<uuid>`) can only ever read its own rows. Platform Ops (`app.role='ops'`) sees all. See `db/schema.sql` §7.
2. **API:** the matching service applies the candidate rule —
   `network_visible = true` FSPs ∪ FSPs with `home_tenant_id = booking.tenant_id`; captive tenants restricted to their home roster (hybrid: per-booking opt-in).
3. **Identity:** FSP PII, consents, verification and empanelment records are held centrally by Dharma Poshanam as data fiduciary; tenants see only the roster fields needed to assign work.

What is **never** shared across tenants: booking records, devotee lists of a captive tenant, captive-roster FSP profiles, tenant revenue data.

What **is** central regardless of mode: FSP identity/KYC, empanelment status, consent records, platform-level ratings, payout ledgers.

## 4. FSP mobility between channels

- An independent Pro-channel FSP (`home_tenant_id = NULL, network_visible = true`) serves the open network and any network/hybrid tenant.
- A captive FSP attached to a tenant may later request network visibility; flipping `network_visible = true` (with tenant consent per the tenant agreement) is the entire migration — one central empanelment record, no re-verification.
- The same person never has two profiles.

## 5. First tenant: DattaMukti

| Item | Value |
|---|---|
| Tenant code | `dattamukti` |
| Domain | swadharma.dattamukti.in |
| Mode | `captive` (recommend revisiting → `hybrid` after commissioning) |
| Go-live | Final commissioning testing in progress |

Onboarding steps: create `tenants` row → issue tenant API key → point subdomain at tenant surface → create tenant admin accounts (Org channel) → attach roster FSPs (each still passes central verification call + interview) → smoke-test RLS with a second dummy tenant before go-live.

## 6. Onboarding checklist for any new Org tenant

1. Signed tenant agreement (data roles, revenue share → `tenants.revenue_share`).
2. Tenant record + API key.
3. Branded surface (subdomain or hosted page).
4. Admin/staff accounts on Org channel.
5. Roster attachment or network access per mode.
6. RLS isolation test in staging (attempt cross-tenant reads — must fail).
7. Payment routing (Razorpay/Stripe sub-account or platform-collect per agreement).
