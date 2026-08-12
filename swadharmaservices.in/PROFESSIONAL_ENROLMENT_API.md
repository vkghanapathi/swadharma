# Professional enrolment — API contract

**Date**: 2026-08-09
**Form**: `enrol.html` on swadharmaservices.in
**Status**: **Endpoint not built.** The form has `ENDPOINT_LIVE = false` and tells applicants to
email instead. Build the endpoint to this contract, then flip the flag.

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
| Honeypot field `website_url` | In the form; silently accepted so bots learn nothing |
| Required phone + **OTP** | The endpoint. The real filter |
| Rate limit per IP and per phone | The endpoint — **not yet specified, must be added** |
| No public listing until verified | Approval flow |

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

**None of those tables exist.** M5 has no migrations at all. This contract is written so the
form can ship and collect interest now, and the backend can be built to meet it.

## 7. Dravya

`dravyaInterest` is an expression of interest only, forwarded to Dravya
(`dravya-web`, asia-southeast1). It has no effect on empanelment and must not gate it. Dravya
runs its own collaborator programme with its own terms; Swadharma is passing a lead, not
enrolling anyone.

Keep the commission wording on the form in step with Dravya's own, or drop the numbers from
the form entirely and link out — two sources of truth for a commission rate will drift.
