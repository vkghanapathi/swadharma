# Swadharma Service Module (SSM)

Platform module connecting devotees with empaneled **Freelance Service Professionals (FSPs)** — purohitas, archakas, veda pārāyaṇa scholars, pāchakas, helpers, bhoktās, apara-karma specialists, event coordinators, and temple managers — via the **Swadharma Mobile App**.

| | |
|---|---|
| **Website** | swadharmaservices.in |
| **Project owner** | Dharma Poshanam |
| **Operator / developer** | ShukaTech.com |
| **Material supply partner** | Dravya4u.com |
| **IP** | Vests in Dharma Poshanam per the ShukaTech software-development MoU |

## Repository layout

```
swadharma-service-module/
├── README.md
├── docs/
│   ├── swadharma-app-database-spec.md   # Full app + DB specification
│   ├── tenant-model.md                  # Org/Pro channels, captive vs network tenancy
│   └── platform-delivery.md             # App+desktop matrix, notifications, live share, dispatch modes
├── web/
│   └── fsp-registration-form.html       # FSP registration form (deploy on swadharmaservices.in)
├── db/
│   └── schema.sql                       # PostgreSQL 16 schema (runnable, Phase P0–P3)
└── api/
    └── openapi.yaml                     # API v1 contract (starter — extend per spec §7)
```

## Core design rules

0. **Two channels, one identity:** Institutions register on the **Org** channel (tenant workspaces, e.g., DattaMukti at swadharma.dattamukti.in); freelancers on the **Pro** channel. Devotees log in on any surface with one global identity. Tenants run **captive**, **network**, or **hybrid** — captive tenant bookings are isolated by Postgres Row-Level Security. See `docs/tenant-model.md`.

1. **Location privacy:** Only the FSP's PIN/ZIP enters the matching system (centroid-based distance). Exact event address is revealed to the FSP — and live status to the devotee — only on the day of the event, gated **server-side** by `bookings.event_location_visible_from`.
2. **Empanelment pipeline:** Application → verification call → empanelment interview → activation. Every state transition audited in `empanelment_events`.
3. **Per-category approval:** The interview panel approves each claimed service category separately (`fsp_services.approved`).
4. **Consent records:** All four registration consents (PIN sharing, verification, communication, declaration) are stored versioned in the `consents` table (DPDP Act 2023 compliance).

## Quickstart (Phase P0)

```bash
# 1. Database
createdb swadharma
psql swadharma -f db/schema.sql

# 2. Web form — static deploy (form POSTs to /api/v1/fsp/applications)
#    Serve web/fsp-registration-form.html at swadharmaservices.in/register
#    and uncomment the fetch() call in its script block once the API is live.

# 3. API — implement per api/openapi.yaml and docs/ §7
#    Target: Node.js (TypeScript) on GCP Cloud Run, api.swadharmaservices.in
```

## Delivery phases

| Phase | Scope |
|---|---|
| **P0** | Registration form + `POST /applications` + Ops empanelment console |
| **P1** | Swadharma Pro (FSP app): profile, availability, offers, day-of mode |
| **P2** | Swadharma (devotee app): dual-channel discovery (Org + Pro), matching, payments — **Stripe US first**, Razorpay on India cutover |
| **P3** | Dravya4u franchise module, long-term placement board, T&T rollout |

See `docs/swadharma-app-database-spec.md` for the complete specification.

---

*Swadharma Dharmik Services · A project of Dharma Poshanam · Operated by ShukaTech.com*
