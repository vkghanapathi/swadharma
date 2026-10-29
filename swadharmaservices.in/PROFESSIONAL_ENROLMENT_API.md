# Professional enrolment — API contract

**Date**: 2026-08-09 · **Built**: 2026-08-12
**Form**: `enrol.html` on swadharmaservices.in
**Status**: **Endpoint built, not yet deployed.** `ENDPOINT_LIVE` stays `false` until
swadharma-api is deployed with it — see §8 for the order. One WhatsApp template is still owed
before phones can actually be verified (§8).

Companion to `ONBOARDING_API.md`, which covers *institution* onboarding. This one covers
*freelance service professionals* — Purohita, Archaka, Decorator, Cook, Helper, Event
Coordinator.

---

## 1. Endpoint

`POST /api/v1/professionals/apply` on **swadharma-api**
(`https://swadharma-api-332912113546.asia-south1.run.app`)

Public and unauthenticated, like the institution equivalent. **It must therefore be rate
limited** — and see §5, because an unauthenticated write endpoint that provisions anything is
exactly how the Vitta Fin callback went wrong (PR #147).

## 2. Payload the form POSTs

```json
{
  "fullName": "…",
  "phone": "+91 …",
  "email": "…",
  "motherTongue": "Telugu",
  "languages": ["Telugu", "Sanskrit", "English"],
  "categories": ["purohita", "cook"],
  "veda": "Krishna Yajurveda",
  "shakha": "Taittiriya",
  "sampradaya": "…",
  "experienceYears": "12",
  "serviceArea": {
    "country": "IN",
    "state": "Andhra Pradesh",
    "town": "Rajahmundry",
    "radiusKm": "50",
    "otherAreas": ["Kakinada", "Pithapuram"]
  },
  "testimonialLinks": ["https://youtube.com/…", "https://instagram.com/…"],
  "about": "…",
  "interview": { "slotPreference": "weekday_evening", "timezone": "IST" },
  "institutionsRequested": ["Datta Mukti Kshetram"],
  "dravyaInterest": ["collaborator"],
  "consents": {
    "detailsTrue": true,
    "locationSharing": true,
    "privacyPolicy": true
  },
  "source": "swadharmaservices.in/enrol"
}
```

`categories` ∈ `purohita | archaka | decorator | cook | helper | event_coordinator`
`dravyaInterest` ∈ `collaborator | stockist | tell_me_later`

## 3. What the endpoint should do

1. **Validate and store** as a *pending application*, not as a live professional. Mirror
   `account_applications`: a new `professional_applications` table, status
   `received | phone_verified | interview_scheduled | approved | rejected`.
2. **Send a phone OTP.** This is the whole anti-spam design (§5). Nothing progresses until the
   number verifies.
3. **Notify** the Swadharma admin queue that an interview needs scheduling.
4. **Never create a `professionals` row here.** That happens on approval, after the interview.
   Enrolment is an application; empanelment is a decision.

## 4. Fields deliberately absent

- **No home address.** Service area only. The M5 rule is *publish the area, never the
  residence*, and adding an address field would break it at the point of collection rather
  than at the point of display — which is much harder to undo.
- **No bank details.** Swadharma holds no professional's money on any route, so it has no
  reason to ask.
- **No documents at this stage.** Credential upload belongs behind a verified account, not on
  a public form.

## 5. Anti-spam — light at the front, heavy at the back

The gate is downstream: verification interview, per-category badge, admin approval. **Nobody
reaches a devotee by filling in this form.** So the front door should stay light, and a spam
submission costs one row.

| Layer | Where |
|---|---|
| Honeypot field `website_url` | In the form; silently accepted so bots learn nothing. The endpoint checks it too — a bot posting straight to the API never sees the form |
| Required phone + **OTP** | The endpoint. The real filter. 6 digits, 10-minute expiry, 5 wrong attempts then lockout, bcrypt-hashed at rest |
| Rate limit per IP | 5 submissions per hour per IP on `/professionals/apply`; 20 per 15 min on verify and resend (`professionalRoutes.ts`) |
| Rate limit per phone | 3 applications per rolling day, counted on the normalised number so reformatting it does not evade the cap (`ProfessionalApplicationController`) |
| Resend throttle | 60-second cooldown, 5 sends maximum per application |
| No public listing until verified | Approval flow — and structurally, since no `professionals` row exists yet |

Do not add a CAPTCHA before OTP is in place and measured. It buys little here and costs real
applicants — many of whom are older purohitas on modest phones.

## 6. After approval

On approval the application becomes:

- a `professionals` row (M5 §2) — platform level, no `client_id`
- `professional_credentials` rows from `testimonialLinks`, `kind = 'link'`
- `professional_verifications` rows, one per requested category, status `requested`
- `professional_empanelments` rows for each institution in `institutionsRequested`, status
  `requested`, awaiting that institution's admin
- a **profile page**, listed by state and town, and on the map by service area

~~**None of those tables exist.** M5 has no migrations at all.~~ They exist as of 2026-08-12:
migration `20260812000001_create_professionals_domain` created the twelve platform-level tables,
and `20260812000002_create_professional_applications` created the staging table this endpoint
writes to. Per-category verification lives in `professional_services.approved` rather than a
separate `professional_verifications` table — the claim and its approval are one fact. See
`docs/professionals-foldin-map.md`.

**Promotion is not built yet.** `professional_applications.professional_id` is the column that
records it, and its being null is what keeps promotion idempotent when it lands. Until then an
approved application creates nothing downstream.

## 8. Deploying this

Order matters, because the static site and the API deploy separately:

1. **Deploy swadharma-api** with the migrations and the routes (push to `main` → Cloud Build;
   migrations run automatically).
2. **Smoke-test** against the deployed API — a submission returns `201 {reference, verification}`,
   a bad code returns 400, six wrong codes return 429.
3. **Then** set `ENDPOINT_LIVE = true` in `enrol.html` and deploy the site. Not before: a live
   form posting to a route that is not yet on Cloud Run fails in front of the applicant.

**Still owed before a phone can actually be verified:** a Meta-approved WhatsApp template named
`swadharma_otp` with one body parameter, plus `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_API_TOKEN`
on the service. Without them `send()` returns false, the endpoint answers
`verification: "pending"`, and the form tells the applicant the team will telephone them — which
is honest, but it means every verification is manual until the template is approved.

Note the other WhatsApp templates in `WhatsAppService` are stubs: `sendTemplateMessage` has its
fetch commented out and returns `true` having sent nothing. `sendVerificationCode` deliberately
does not use it — for an OTP, an optimistic `true` would record a code as delivered that no phone
ever received.

## 7. Dravya

`dravyaInterest` is an expression of interest only, forwarded to Dravya
(`dravya-web`, asia-southeast1). It has no effect on empanelment and must not gate it. Dravya
runs its own collaborator programme with its own terms; Swadharma is passing a lead, not
enrolling anyone.

Keep the commission wording on the form in step with Dravya's own, or drop the numbers from
the form entirely and link out — two sources of truth for a commission rate will drift.
