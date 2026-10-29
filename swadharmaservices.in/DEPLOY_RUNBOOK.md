# Swadharma Services — Go-Live Runbook (for VKG approval)

> ## ⛔ SUPERSEDED IN PART — VKG policy decision, 2026-08-09
>
> **Vitta Fin is not to be used for Swadharma Services.** Steps 2 and 4, and the
> `VITTA_FIN_CALLBACK_SECRET` wiring in Step 1, are dead. Do not execute them.
>
> Subscription billing moves **into `swadharma-api`**, talking to Stripe and Razorpay directly.
> The India / Rest-of-the-world choice on the signup form selects which.
>
> **What this decision deletes, and it is worth stating plainly:**
> `POST /api/v1/accounts/vittafin/callback` (`accountRoutes.ts:12`) is the fail-open HMAC
> endpoint recorded as finding 5 in the security handover — anonymous tenant provisioning and
> payment bypass, live because `VITTA_FIN_CALLBACK_SECRET` is configured nowhere. **Removing the
> route closes the finding by removing the attack surface**, which is better than fixing it. The
> branch `fix/vitta-callback-auth-fail-closed` (366303a) becomes unnecessary — delete the route
> instead of merging it.
>
> **What this decision carries forward:** the replacement is the *same class of endpoint* — an
> unauthenticated webhook that provisions tenants and confirms payment. It must verify the
> gateway signature and **fail closed** from its first commit. The Vitta callback failed open
> because verification ran only `if (secret)`. Do not reproduce that shape.
>
> `account_applications` (migration `20260723000001`) and `AccountApplicationController` survive —
> they are the SSM-side record and are unaffected.
>
> Future note: if Vitta Fin becomes an independent product, Shuka Technologies may take over its
> distribution and maintenance, so Dharma Poshanam can stay on its core activities. That is a
> separate product decision and does not revive the integration here.

Everything below is **prepared, not executed**. Nothing is deployed until you approve.
Order matters: create gateway objects → deploy backends + set env → redeploy the form → smoke-test.

Resources:
- **SSM API**: service `swadharma-api`, project `swadharma-service-management`, region `asia-south1`
  (deploys via Cloud Build on push to `main`; migrations run automatically).
- **SSM static site**: Cloud Run service `swadharmaservices`, same project/region.
- **Vitta API**: Cloud Run service `vitta-api`, project `aayojana`, region `asia-south1`
  → `https://vitta-api-ijxrwoeiyq-el.a.run.app` (⚠ confirm the deploy trigger — see Step 2).
- **Repos**: `Dharma-Poshanam/swadharma-service-management` (main) · `vkghanapathi/vitta` (master).

---

## Step 0 — Dashboards (VKG; I cannot do these)
1. **Stripe** → create recurring USD prices + coupon; note the IDs:
   - $49/month  → `STRIPE_PRICE_DHARMA_SATRAM`
   - $499/year  → `STRIPE_PRICE_DHARMA_SATRAM_ANNUAL`
   - coupon "Welcome-Offer" (e.g. 40% off, duration as desired) → `STRIPE_COUPON_WELCOME_OFFER`
2. **Razorpay** → create subscription plans + offer; note the IDs:
   - ₹4,410/month → `RAZORPAY_PLAN_DHARMA_SATRAM`
   - ₹44,910/year → `RAZORPAY_PLAN_DHARMA_SATRAM_ANNUAL`
   - offer "Welcome-Offer" → `RAZORPAY_OFFER_WELCOME`
3. Generate one shared secret for the Vitta→SSM callback:
   `openssl rand -hex 32`   → call it `$CALLBACK_SECRET`

---

## Step 1 — Deploy SSM (backend + migration)
```bash
cd "swadharma-service-management"
# Commit ONLY the account-onboarding files (not stray working-tree changes):
git add backend/migrations/20260723000001_create_account_applications.ts \
        backend/src/controllers/AccountApplicationController.ts \
        backend/src/routes/accountRoutes.ts \
        backend/src/app.ts
git commit -m "Add account onboarding + Vitta Fin provisioning callback"
git push origin main       # → Cloud Build deploys swadharma-api and runs the migration on prod DB

# Env on swadharma-api (shared secret + allow the static-site origin for CORS).
# ^##^ sets a custom delimiter so the comma inside ALLOWED_ORIGINS is not split.
gcloud run services update swadharma-api \
  --project swadharma-service-management --region asia-south1 \
  --update-env-vars VITTA_FIN_CALLBACK_SECRET="$CALLBACK_SECRET" \
  --update-env-vars ^##^ALLOWED_ORIGINS="https://swadharma-service-egjykw6opa-el.a.run.app,https://swadharmaservices-332912113546.asia-south1.run.app,https://swadharmaservices.in"
```
SSM callback URL (used in Step 2):
`https://swadharma-api-egjykw6opa-el.a.run.app/api/v1/accounts/vittafin/callback`

---

## Step 2 — Deploy Vitta (backend + migration + env)
```bash
cd "vitta/vitta-api"
git add src/lib/pricing.ts src/env.ts src/lib/stripe.ts src/lib/razorpay.ts \
        src/lib/signupApproval.ts src/lib/swadharmaNotify.ts src/routes/portal.ts \
        src/db/schema.ts drizzle/migrations/0009_add_signup_billing_cycle.sql drizzle/migrations/meta
git commit -m "Dharma Satram standalone pricing + Welcome-Offer coupon + SSM provisioning bridge + billingCycle"
git push origin master

# Run the Drizzle migration against Vitta's prod DB (adds tenant_signup_requests.billing_cycle):
DATABASE_URL="<vitta prod owner/ADMIN url>" npm run db:migrate

# ⚠ CONFIRM how vitta-api (Cloud Run, aayojana) redeploys — either a Cloud Build
# trigger on push, or a manual source deploy. If manual:
gcloud run deploy vitta-api --source . --project aayojana --region asia-south1

# Env on vitta-api:
gcloud run services update vitta-api --project aayojana --region asia-south1 \
  --update-env-vars STRIPE_PRICE_DHARMA_SATRAM="price_...",STRIPE_PRICE_DHARMA_SATRAM_ANNUAL="price_...",STRIPE_COUPON_WELCOME_OFFER="...",RAZORPAY_PLAN_DHARMA_SATRAM="plan_...",RAZORPAY_PLAN_DHARMA_SATRAM_ANNUAL="plan_...",RAZORPAY_OFFER_WELCOME="offer_...",SSM_ACCOUNTS_CALLBACK_URL="https://swadharma-api-egjykw6opa-el.a.run.app/api/v1/accounts/vittafin/callback",SSM_ACCOUNTS_CALLBACK_SECRET="$CALLBACK_SECRET"
```
(`SSM_ACCOUNTS_CALLBACK_SECRET` MUST equal `VITTA_FIN_CALLBACK_SECRET` from Step 1.)

---

## Step 3 — Redeploy the static signup site (has the Vitta wiring)
```bash
# Run from the repository root. The build dir is this folder — it holds the
# Dockerfile and nginx.conf, so there is nothing to copy anywhere first.
gcloud run deploy swadharmaservices --source swadharmaservices.in \
  --project swadharma-service-management --region asia-south1 \
  --allow-unauthenticated --port 8080 --min-instances 0 --max-instances 2 --quiet
```

---

## Step 4 — Smoke test (use Stripe/Razorpay TEST keys first)
```bash
# 1) signup-request returns a requestId
curl -s -X POST https://vitta-api-ijxrwoeiyq-el.a.run.app/portal/signup-request \
  -H 'Content-Type: application/json' \
  -d '{"tenantName":"Test Trust","tenantSlug":"testtrust","contactName":"T","contactEmail":"t@example.org","contactPhone":"+15157704705","country":"US","orgType":"npo","selectedTier":"single","selectedModules":["dharma_satram"],"billingCycle":"monthly"}'
# 2) start-checkout returns a gateway URL (Stripe session / Razorpay short_url)
# 3) complete a TEST payment → confirm Vitta approves → SSM gets the callback →
#    a clients row appears for swadharma.testtrust and the welcome/ops emails send.
```

## Rollback
- SSM: revert the commit + push (Cloud Build redeploys); the migration is additive
  (new empty table) so no data rollback needed.
- Vitta: revert the commit + redeploy; `billing_cycle` has a default, safe to leave.
- Static site: `gcloud run services update swadharmaservices --to-revisions <prev>=100`.

## Notes
- All new env vars default to empty → endpoints degrade to 503 / confirmation fallback
  if a value is missing, so a partial rollout never charges incorrectly.
- Keep Stripe/Razorpay in TEST mode until Step 4 passes, then swap to live keys.

---

## Static site — the public pages

The public front end was rewired on 2026-08-22 into a multi-route site with a
generated shell. **Do not hand-edit the root `*.html` files that build_pages.py
owns** — see [FRONTEND_REWIRE.md](FRONTEND_REWIRE.md).

Before any `gcloud run deploy swadharmaservices`:

```bash
cd swadharmaservices.in
python build_pages.py --check    # committed pages match _layout/
python test_site.py              # links, routes, assets, markup
node   test_browser.mjs          # every page in a real DOM (needs SW_JSDOM)
```

The Dockerfile now copies `*.js` as well as `*.html` and `*.css`. A build that
skipped them would serve pages that render but do not work.

