# Swadharma Services — Account Onboarding (Phase plan)

> ## ⛔ VITTA FIN INTEGRATION REMOVED — VKG decision, 2026-08-11
>
> **Everything below describing `POST /api/v1/accounts/vittafin/callback` is dead.** The route,
> its handler, and the tenant provisioning it performed were deleted from `swadharma-api` on
> 2026-08-11. Do not re-add them, and do not use this document as the contract for the
> replacement.
>
> **Why it was deleted rather than fixed:** the callback verified its HMAC only `if (secret)`,
> and `VITTA_FIN_CALLBACK_SECRET` was configured nowhere. Any anonymous POST could therefore
> provision a live tenant and mark a subscription paid — security finding 5 in the 2026-08-08
> handover. Deleting the surface closes the finding outright.
>
> **What survives:** `POST /api/v1/accounts/apply`, the `account_applications` table, and the
> admin listing. `apply` records a lead and nothing else — it takes no money, provisions no
> tenant, and returns `{ reference, gateway }` with no payment redirect. Credentials pasted
> into the form are redacted before storage (`AccountApplicationController.redactSecrets`).
>
> **What replaces it:** a Stripe integration owned by Shuka Technologies, billing direct from
> `swadharma-api` (Razorpay for India). Its webhook is the same class of endpoint —
> unauthenticated, provisions tenants, confirms payment — so it **must verify the gateway
> signature unconditionally and reject when the secret is missing**. Never `if (secret)`.
>
> Regression guard: `backend/tests/security/no-anonymous-provisioning.test.ts`.

## Phase 1 — DONE (this folder)
Self-serve onboarding form at `signup.html`, hosted on **swadharmaservices.in**.
- Collects organisation, contact, payment-method intent, donation setup, and plan.
- **No money movement, no secret credentials.** Secret API keys are explicitly *not* collected.
- Submits JSON to `SIGNUP_ENDPOINT` (a `const` at the top of the `<script>` in `signup.html`).
  While that constant is empty, the form falls back to an email hand-off to
  `swadharma@dharmaposhanam.in`, so it is usable today.

### JSON payload the form POSTs
```json
{
  "organisation": { "name", "type", "region": "US|IN|OTHER", "domain", "subdomain": "swadharma.<slug>" },
  "contact":      { "name", "role", "email", "phone", "city" },
  "payments":     { "method": "own_gateway|facilitated", "stripeAccount", "razorpayKeyId", "facilitationAffiliate" },
  "donations":    { "categories": ["shraddha", ...], "corpusDeclaration": bool, "collectDonorAddress": bool },
  "subscription": { "plan": "monthly|annual", "requestFoundingDiscount": bool },
  "source": "swadharmaservices.in/signup",
  "submittedAtClient": "<ISO ts>"
}
```

## Phase 2 — REQUIRES VKG APPROVAL before coding
Build the SSM backend endpoint the form posts to, and the money-movement wiring.

1. **Endpoint** `POST /api/v1/accounts/apply` on `swadharma-api` (Cloud Run).
   - Public but rate-limited + captcha/anti-abuse (new public surface — see CLAUDE.md COOP notes).
   - Creates an `applications` row (status `pending`), NOT a live `clients` row, until reviewed.
   - Returns `{ "reference": "SW-XXXX-YYYY" }`.
   - Then set `SIGNUP_ENDPOINT` in `signup.html` to this URL.

2. **Approve → provision** creates the `clients` row (table already exists) with:
   - `region`, `currency` (USD/INR), `subdomain`, branding, feature_flags for the chosen donation categories.
   - Reuses existing `PaymentConfigService` (per-tenant) — already supports per-client Razorpay keys.

3. **Payments (decision: independent per-org keys)**
   - **India** — org's own **Razorpay** Key ID in `client_settings`; **secret in Google Secret Manager** (SecretsService already exists). Funds settle to the org directly.
   - **USA** — new **StripeService** (mirror `RazorpayService.ts`), org's own Stripe account; secret in Secret Manager.
   - **Facilitated (small orgs)** — a Dharma Poshanam affiliate's own gateway account collects; remit to org minus facilitation fee. **Fee %, receipt issuer, and tax/compliance (501(c)(3) / 80G, payment-facilitator status) are VKG/legal decisions — do not implement until confirmed.**

4. **Vitta Fin ledger** — mark each donation to its organisation. Confirm integration surface (API vs export).

5. **Donation fields** come from the existing SSM reservation/donor model
   (donor address, corpus-fund declaration already present).

## FINAL WIRING — connected to Vitta Fin's existing portal (BUILT + tested; needs prod deploy)

Vitta Fin already had the full signup→pay→provision engine, so we **connect** to it
rather than duplicate it. Flow:

```
swadharmaservices.in/signup.html
  → POST  vitta-api /portal/signup-request   (tenantSlug, country IN/US, module 'dharma_satram', tier)
  → POST  vitta-api /portal/start-checkout    → { url }   (India→Razorpay, US→Stripe)
  → browser redirects to gateway; user pays
  → Vitta webhook auto-approves  → approveSignupRequest()
       → NEW: notifySwadharmaProvision()  →  signed POST to SSM
            /api/v1/accounts/vittafin/callback   { reference, status:'paid', account, signature }
       → SSM provisions clients row (swadharma.<slug>) + Step-6 emails (direct vs 15%/weekly)
```

Code added:
- **Vitta**: `src/lib/swadharmaNotify.ts` + a gated call in `approveSignupRequest()` (fires only
  when the approved signup includes the `dharma_satram` module). Env: `SSM_ACCOUNTS_CALLBACK_URL`,
  `SSM_ACCOUNTS_CALLBACK_SECRET`.
- **SSM**: `vittaFinCallback` now provisions from the Vitta payload when there is no local
  application row. Signature = HMAC-SHA256(`${reference}.${status}`, shared secret) — verified
  symmetric from both sides in tests.
- **Form**: posts to Vitta's portal (two-step) and redirects to the gateway.

### Pricing — RESOLVED (standalone module + Welcome-Offer coupon)
`dharma_satram` is now a **standalone-priced module** in Vitta's catalog: **$49/mo (₹4,410)**,
**$499/yr (₹44,910)**. When a signup is a single standalone module, checkout/approval use the
module's own price (not the $9.90 'single' tier), and apply the early-bird discount via the
**"Welcome-Offer"** coupon (Stripe coupon / Razorpay offer) — the discount is NOT baked into the base price.

Wired + tested (backward-compatible; all 49 existing Vitta lib tests still pass):
- `pricing.ts` — `dharma_satram` standalone monthly+annual prices; `isStandaloneModule()`.
- `stripe.ts` — `priceIdForModule(key, cycle)`, `welcomeOfferCoupon()`; `createSubscription` takes
  `priceIdOverride` + `couponId`.
- `razorpay.ts` — `planIdForModule(key, cycle)`, `welcomeOfferId()`; `createSubscription` takes
  `planIdOverride` + `offerId`.
- `portal.ts /start-checkout` (India) + `signupApproval.ts` (USA) use the standalone path.

**Monthly is fully wired.** Annual primitives exist (env + priceIdForModule 'annual') but selecting
annual needs a `billingCycle` field on the signup request (small Drizzle schema add) — deferred.

### External steps to go live (need VKG / dashboards)
1. Create in **Stripe**: recurring prices `STRIPE_PRICE_DHARMA_SATRAM` ($49/mo),
   `STRIPE_PRICE_DHARMA_SATRAM_ANNUAL` ($499/yr), and coupon `STRIPE_COUPON_WELCOME_OFFER` ("Welcome-Offer").
2. Create in **Razorpay**: plans `RAZORPAY_PLAN_DHARMA_SATRAM` (₹4,410/mo),
   `RAZORPAY_PLAN_DHARMA_SATRAM_ANNUAL`, and offer `RAZORPAY_OFFER_WELCOME`.
3. Set those env vars on `vitta-api`, plus `SSM_ACCOUNTS_CALLBACK_URL` + shared
   `SSM_ACCOUNTS_CALLBACK_SECRET`; set the same secret as `VITTA_FIN_CALLBACK_SECRET` on `swadharma-api`.
4. Deploy vitta-api + SSM (SSM push runs the account_applications migration) + redeploy the static site.

## Vitta Fin — payment-gated provisioning (superseded by FINAL WIRING above)

Confirmed flow: signup → **Vitta Fin hosted subscription page** (India→Razorpay, else→Stripe)
→ Vitta Fin callback → SSM provisions the tenant in the `clients` table.

Implemented in SSM (`AccountApplicationController`):
- `POST /api/v1/accounts/apply` → stores the application, computes `gateway`
  (region `IN`→razorpay, else→stripe), returns `{ reference, gateway, redirectUrl }`.
  The form redirects the browser to `redirectUrl` to pay.
- `POST /api/v1/accounts/vittafin/callback` → verifies signature, and on `status:"paid"`
  provisions the tenant (`clients` row, idempotent) and marks the application `provisioned`.

### Env vars (set on swadharma-api)
| Var | Purpose |
|-----|---------|
| `VITTA_FIN_SUBSCRIBE_URL` | Vitta Fin hosted subscription page base URL (redirect target). If unset, the form just shows a confirmation. |
| `VITTA_FIN_RETURN_URL` | Where Vitta Fin returns the user after payment (e.g. https://swadharmaservices.in/welcome). |
| `VITTA_FIN_CALLBACK_SECRET` | Shared secret; callback `signature` = HMAC-SHA256(`{reference}.{status}`, secret). |

### NEEDED FROM VITTA FIN (to finish the real wiring)
1. **Redirect URL** and the exact **query params** its hosted page expects (our proposed set:
   `ref, region, gateway, plan, founding, return_url` — tell us the real names/format).
2. **Callback contract**: method/URL it will call, payload fields, and signature scheme
   (our proposed: `POST {reference,status,signature}`, HMAC-SHA256). We adapt to match.
3. How amount/currency is decided (we pass plan+region+founding and let Vitta Fin price it).

## Phase 3 — Subscription lifecycle (POLICY CONFIRMED by VKG; build after Phase 2)

Vitta Fin (suite module No.2) is the **platform billing ledger** — the org pays Dharma
Poshanam the $49/mo or $499/yr subscription here. This is separate from donation collection
(which uses each org's own gateway, per the independent-per-org-keys decision).

### Transfer: push-first
- Vitta Fin **emits webhooks** to SSM `POST /webhooks/vittafin` (signature-verified, mirroring
  the existing `handleRazorpayWebhook`). Vitta Fin is our own module, so build it to push.
- Daily **reconcile** call to Vitta Fin API as a missed-event safety net (not polling).
- Lands in a new `subscriptions` table (one row per `client_id`; `current_period_end` = expiry)
  and an append-only `subscription_events` log.

### Check cadence
- **Access gate: every API request** — middleware reads cached `current_period_end` (O(1),
  like `clientDetection`). This is the real enforcement.
- **Daily sweep** (Cloud Scheduler → `/jobs/subscription-sweep`, ~02:00 IST): sends emails,
  applies state transitions, reconciles with Vitta Fin.

### Timeline (CONFIRMED)
1. **Pre-expiry — 7 daily reminder emails**, T‑7 through T‑1, reminding to renew.
2. **Expiry date reached → Grace period, 7 days.** Account stays **fully functional**.
   Daily **warning email** stating the expiry date and the grace-end date.
3. **After grace ends → READ-ONLY.** Data access is retained (portal + existing records visible),
   but **no new transactions** (no new bookings/donations through the portal).
   Renewal (invoice.paid via Vitta Fin) reactivates immediately.
   Never hard-block/404 a temple's public page over a lapsed subscription.

### State machine
```
active ──(period_end passed)──► grace (7 days, full access, daily warning email)
grace  ──(grace elapsed)──────► read_only (data visible, no new transactions)
any    ──(invoice.paid)───────► active (reactivated)
any    ──(cancel)─────────────► canceled
```
Every transition + email is written to `subscription_events`. Emit Cloud Monitoring metrics
for expiring-soon count, failed renewals, read-only conversions; alert on missed webhooks.

## Step 6 — on provisioning (CONFIRMED)
When a paid callback provisions a tenant, SSM now (best-effort, non-blocking):
- Emails the **account holder** a welcome + next-steps message, branched on settlement mode.
- Emails **ops** to prompt the phone/WhatsApp follow-up.
- Persists the settlement terms in `clients.payment_config`:
  - **direct** (own gateway): `settlementMode:'direct'`, `facilitationFeePercent:0`.
    Ops contacts the holder on phone/WhatsApp to set up their own Razorpay/Stripe gateway.
  - **facilitated** (DPI): `settlementMode:'facilitated'`, `facilitationFeePercent:15`,
    `payoutSchedule:'weekly'`. DPI collects, retains **15%** for expenses, remits weekly.
  (The weekly payout execution job itself is future work.)

## Open items for VKG
- swadharmaservices.in domain registration + DNS.
- **Legal/tax sign-off** for DPI facilitation (who issues the donation receipt; payment-facilitator status). Fee is decided (15%, weekly); the compliance question remains.
- **Vitta Fin handshake spec** (Steps 4–5): hosted subscribe URL + expected params + callback contract/signature — OR access to the Vitta Fin repo so we build that side too.
- Welcome/ops email copy — review wording (currently sensible defaults).
