# SSM Platform Delivery, Notifications & Live Share

**Version 1.6 · 12 August 2026 · Companion to `swadharma-app-database-spec.md` and `tenant-model.md`**

Positioning: an app-operated platform for dharmik services — the booking/tracking experience parallels ride-hailing (Uber), but dispatch is **scheduled and identity-forward** (devotee selects a specific empaneled professional against a muhūrta), with an **urgent broadcast mode** reserved for apara karma.

---

## 1. Platform matrix (app + desktop per role)

| Role | Primary surface | Secondary surface | Rationale |
|---|---|---|---|
| **Devotee** | Swadharma mobile app | Responsive web booking on swadharmaservices.in and tenant surfaces (e.g., swadharma.dattamukti.in) | Web-first discovery/booking (no forced install before first booking); app for event-day tracking, masked calls, history |
| **FSP (Pro)** | Swadharma Pro mobile app | Web portal: profile editing, availability, earnings statements, document upload | App mandatory for day-of mode (GPS, push, camera); desktop convenient for long-form profile text and statements |
| **Ops / Admin** | Desktop web console | Mobile console view for on-the-go approvals | Empanelment queues, disputes, payouts need screen space |
| **Org tenant admin/staff** | Desktop web workspace | Mobile view | Roster management, booking desk, placement postings |

All surfaces authenticate against the single Firebase identity layer; a devotee account works identically on app, main site, and any tenant surface.

### 1.1 App line-up decision (v1.3)

Three product brands, staged as native apps:

| Brand | Audience | Launch form | Native app |
|---|---|---|---|
| **Swadharma** | Devotees | Native app (Android + iOS) + responsive web booking | Day one (P2) |
| **Swadharma Pro** | FSPs | Native app (Android + iOS) + web portal | Day one (P1) |
| **Swadharma Org** | Institutions / tenants | **Installable PWA** (desktop-first workspace, home-screen install, web push) | Promoted to native when tenant volume justifies (~15–20 active tenants) |

Rationale: Pro and devotee apps need GPS, camera, and low-latency push. Org users are few, desktop-heavy, and mobile-thin (approvals, monitoring) — a PWA covers this with no extra store listings or release trains. All three share the Flutter `core` package, so promoting Org to a native target later is a packaging decision, not a rebuild.

**Action item:** reserve app identifiers and store namespaces for all three now (e.g., `com.swadharma.app`, `com.swadharma.pro`, `com.swadharma.org`), including the Org app that does not yet exist.

**PWA confirmation (v1.4):** Org operators/admins on mobile are served by the PWA. iOS caveat: web push requires the PWA to be installed to the home screen (iOS 16.4+) — make "Install to home screen" a step in tenant admin onboarding. Android PWAs support push natively.

### 1.2 Rollout order (v1.4)

Swadharma Pro launches **USA first**, India the following week. ShukaTech operates both regions (India bank accounts opening).

| Step | Region | Payments | Notes |
|---|---|---|---|
| 1 | **USA** | **Stripe Connect Express** from day one | US FSP empanelment collects SSN/EIN via Connect onboarding; 1099-NEC year-end reporting; verification calls scheduled in US time zones |
| 2 | **India (T+1 week)** | **Transitional mode** until ShukaTech India accounts open: direct UPI/collect or platform-held via designated account, reconciled manually in `payments` with gateway='manual' rows | Bookings fully live; payout ledger accrues |
| 3 | India cutover | **Razorpay Route** | FSP payout accounts linked; accrued payouts settled |

(Amends the P1/P2 payment order in the main spec §9: Stripe precedes Razorpay.)

### 1.3 Devotee app: dual-channel discovery (v1.4)

The Swadharma devotee app surfaces **both channels** in one marketplace:

| Card type | Backed by | Devotee picks | fsp_id at booking |
|---|---|---|---|
| **Professional** | Pro-channel FSP (network_visible) | The person | Set at booking |
| **Organization** | Org tenant with `listed_in_marketplace = true` | The org's service (e.g., a DattaMukti pūjā package) | NULL — assigned later by the tenant from its own roster |

Captive isolation is unaffected: listing controls *visibility of the org's offerings*; captivity controls *who can see the org's data*. A captive, listed tenant receives devotee bookings from the open app while its bookings, roster, and devotee lists remain isolated from all other tenants.

## 2. Notification matrix

Channels: **In-app (FCM)** + **Email** are the channels of record for every confirmatory message. **WhatsApp/SMS** additionally for time-critical events (offer TTLs cannot wait on email checking habits).

| Event | Devotee | FSP | Channels |
|---|---|---|---|
| Application received / empanelment status change | — | ✓ | In-app, Email, WhatsApp |
| Booking request placed | ✓ | — | In-app, Email |
| Offer received (TTL 4 h) | — | ✓ | In-app, **WhatsApp/SMS**, Email |
| Booking confirmed (FSP accepted, payment done) | ✓ | ✓ | In-app, Email, WhatsApp |
| T-1 day reminder (muhūrta, sāmagri checklist) | ✓ | ✓ | In-app, WhatsApp |
| Event-day: venue unlocked | — | ✓ | In-app push |
| Journey started / Reached / Completed | ✓ | (self) | In-app push |
| Payment receipt / payout processed | ✓ | ✓ | Email (document of record), In-app |
| Rating request | ✓ | — | In-app |

Implementation: a single `notifications_outbox` worker (Cloud Run job) fans out per-channel with per-user channel preferences; email templates versioned; all sends logged.

```sql
-- addition to schema (v1.2)
CREATE TABLE notifications_outbox (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id),
  booking_id   UUID REFERENCES bookings(id),
  event_type   TEXT NOT NULL,          -- offer_received | booking_confirmed | ...
  channels     TEXT[] NOT NULL,        -- {'inapp','email','whatsapp','sms'}
  payload      JSONB NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | partial | failed
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at      TIMESTAMPTZ
);
```

## 3. Live share (event-day journey tracking)

### 3.1 Flow

1. **Venue unlock (T-12h, configurable):** exact venue address + geo-pin (devotee's home or other pre-specified venue) becomes visible to the assigned FSP — server-gated by `bookings.event_location_visible_from`.
2. **Start journey:** FSP taps *Start journey* in day-of mode. Live location streaming begins.
3. **During journey:** devotee sees FSP position, ETA, and status on a map (ride-hailing style). FSP sees venue pin + one-tap navigation deep-link (Google Maps). Masked calling active for both.
4. **Reached:** FSP taps *Reached* (or geo-fence auto-suggests at 100 m). Devotee notified.
5. **Auto-termination:** streaming stops at *Reached* + 15 min, or at a hard cap of ETA × 2, whichever first.

### 3.2 Bidirectional visibility, asymmetric movement

- **FSP → devotee:** live position stream (the moving party).
- **Devotee → FSP:** exact venue pin (fixed), unlocked on event day.
- **Optional devotee live share:** for venue types where the meeting point is approximate (riverbank/ghat apara karma, procession assembly points), the devotee may also live-share until the parties meet. Off by default; per-booking opt-in.

### 3.3 Privacy & data handling

- Positions are written **only** to Firestore ephemeral docs `live/{bookingId}` (position, heading, eta, updated_at), updated every 10–15 s while journey mode is active; documents TTL-deleted 24 h after event.
- **No location trail is persisted in Postgres.** Only status timestamps (`booking_status_events`: started / reached / completed) are durable — sufficient for disputes without retaining movement history.
- Live share is scoped to the two booking parties + Ops (dispute window only); tenants see status, not positions.
- Both parties can end their own share at any time; ending share does not cancel the booking.

### 3.4 Firestore doc shape

```
live/{bookingId} = {
  fsp:     { lat, lng, heading, eta_min, updated_at },
  devotee: { lat, lng, updated_at } | null,      // only if opted in
  journey_state: 'idle' | 'en_route' | 'reached' | 'ended',
  expires_at: <event_end + 24h>                  // TTL policy field
}
```

Security rules: read/write restricted to the two party UIDs on the booking (verified via custom claims minted by the backend when journey mode starts) and Ops service account.

## 4. Dispatch modes (Uber parallel, adapted)

| Mode | Trigger | Matching | Used for |
|---|---|---|---|
| **Scheduled select** (default) | Devotee books days/weeks ahead against a muhūrta | Devotee chooses from ranked FSP cards; chosen FSP accepts/declines within TTL | Pūjās, homas, saṁskāras, catering, coordination |
| **Urgent broadcast** | Same-day need | Offer fanned out simultaneously to all eligible, available FSPs within radius; first acceptance wins, others auto-expire | **Apara karma** primarily; last-minute replacements |

Both modes run on the existing `booking_offers` table (broadcast = many offer rows with short TTL).

## 5. Commercial model (v1.5)

| Mode | Fee | Money flow | Who pays the platform |
|---|---|---|---|
| **Referral** (default) | **6%** of booking value | Devotee pays FSP/Org **directly** | FSP/Org, via monthly consolidated `fee_invoices` (auto-debit mandate / online payment / offset against facilitated payouts) |
| **Facilitated** (opt-in by FSP/Org) | 6% + **4–5%** facilitation = 10–11% total | Platform collects from devotee via **DPI rails (USA, Stripe Connect)** or **DPT rails (India, Razorpay Route)**, deducts fees, pays out | Deducted at source |

Fee percentages are stored per booking (`settlement_mode`, `referral_fee_pct`, `facilitation_fee_pct`) so future tier changes never rewrite history.

**Rollout note:** India launch deferred one week to coincide with bank account opening — Razorpay live from day one, no transitional payment mode. US launch on Stripe proceeds as scheduled.

**Structuring position (settled, v1.6):** DPI (USA) and DPT (India) treat platform fees as **program-service revenue within their dharmik mandate** — promoting and facilitating dharmik programs and community support events is their exempt purpose, consistent with established practice (analogous to a temple's published pūjā fee schedule). DPI is merchant of record in the US; DPT in India.

## 6. Money flow, credits & recurrence (v1.6)

**Collection (always digital, always to the app):** the devotee pays the app for every booking — Stripe into DPI (US), Razorpay into DPT (India).

**Credit-on-change policy:** if an event is postponed or cancelled, the amount paid converts to **account credit** on the devotee's ledger (`credit_ledger`), applicable to any future booking. No cash refunds in the normal course; exceptional refunds are Ops-approved ledger entries.

**FSP payout (offline):** the platform pays the FSP the **published service fee** (`service_fee_schedule`) by **cheque or cash, as mutually convenient**, recorded in `payouts` with method and acknowledgment (cheque no. / signed voucher). Digital transfer remains available as an option.

**Dakṣiṇā policy:** devotees may voluntarily give additional dakṣiṇā to the FSP beyond the published fee — the platform does not object and does not take a share. **Demanding** payment above the published fee is a violation of FSP terms and grounds for suspension. This clause goes verbatim into the FSP agreement and the in-app service detail shown to devotees ("Published fee: ₹X. Anything additional is entirely at your discretion").

**Recurring events:** bookings are one-time or part of a `booking_series` (daily / weekly / monthly / yearly / **tithi-based** — pañcāṅga-resolved recurrence, e.g., māsika on the tithi). Each occurrence is its own booking: postponing one occurrence converts that occurrence's payment to credit without touching the series.
