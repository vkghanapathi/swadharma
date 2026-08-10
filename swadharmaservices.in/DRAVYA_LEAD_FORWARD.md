# Swadharma → Dravya lead forward — API contract

**Date**: 2026-08-09
**Companion to**: `PROFESSIONAL_ENROLMENT_API.md` §7, which says `dravyaInterest` is
"an expression of interest only, forwarded to Dravya… Swadharma is passing a lead, not
enrolling anyone." This is that forward, specified.

**Status**: **Dravya side is built** (`POST /api/v1/partners/swadharma/leads`, code in
`dravya/backend/app/api/v1/partners.py`, awaiting a schema migration). **Swadharma side is
not** — `POST /api/v1/professionals/apply` does not exist yet, so there is nothing to forward
from. Build this when that endpoint lands.

---

## 1. Endpoint

`POST /api/v1/partners/swadharma/leads` on **dravya-api**

Signed, machine-to-machine, JSON. Not public: unlike the enrolment form, this endpoint is
called by a server we control, so it gets real authentication rather than a honeypot.

## 2. Authentication

Header `X-Swadharma-Signature`: hex HMAC-SHA256 over `"{reference}.{phone_e164}"` using the
shared secret.

```
signature = HMAC_SHA256(f"{reference}.{phone_e164}", SWADHARMA_LEAD_SECRET)
```

Same scheme as the existing Swadharma ↔ Vitta Fin callback, so there is one signing
convention across the estate instead of three. `phone_e164` is the digits of the applicant's
phone with a leading `+` and nothing else — `+919876543210`.

Secrets:

| Side | Variable |
|---|---|
| swadharma-api | `DRAVYA_LEAD_SECRET` |
| dravya-api | `SWADHARMA_LEAD_SECRET` |

**An unset secret disables the feed** (503) — it never means "signature optional". That is
the specific failure mode from the Vitta Fin callback (PR #147) and Dravya's implementation
fails closed on it, with a test that says so.

## 3. Payload

```json
{
  "reference": "SW-2026-0042",
  "full_name": "Pandit Anantha Śarma Trivedī",
  "phone": "+91 98765 43210",
  "email": "anantha@example.com",
  "categories": ["purohita"],
  "dravya_interest": ["collaborator", "stockist"],
  "sampradaya": "smarta",
  "veda": "Krishna Yajurveda",
  "shakha": "Taittiriya",
  "experience_years": 12,
  "languages": ["Telugu", "Sanskrit", "English"],
  "service_area": {
    "country": "IN",
    "state": "Karnataka",
    "city": "Mysuru",
    "postal_code": "570004",
    "radius_km": 50,
    "other_areas": ["Nanjangud", "T. Narasipura"]
  },
  "about": "…",
  "source": "swadharmaservices.in/enrol"
}
```

Field mapping from the enrolment payload — most of it is a straight copy:

| Enrolment form | Lead field | Note |
|---|---|---|
| `fullName` | `full_name` | |
| `phone` | `phone` | Dravya normalises to E.164 itself |
| `categories` | `categories` | passed for context; Dravya does not act on it |
| `dravyaInterest` | `dravya_interest` | the only field that decides anything |
| `experienceYears` | `experience_years` | string → int |
| `serviceArea.town` | `service_area.city` | **rename** |
| `serviceArea.radiusKm` | `service_area.radius_km` | string → int |
| `serviceArea.otherAreas` | `service_area.other_areas` | |
| `institutionsRequested` | — | **not sent.** Swadharma's institutions are none of Dravya's business |
| `testimonialLinks` | — | **not sent.** Credentials are re-collected by Dravya if it needs them |
| `consents` | — | **not sent.** Consent was given to Swadharma, and does not transfer |

### What is deliberately not forwarded

Consent is the important one. A priest consenting to Swadharma's privacy policy has not
consented to Dravya's. Ticking a Dravya checkbox is consent to *being contacted by Dravya*,
which is exactly the scope of this forward — a name, a number, and the fact that they are
interested. Dravya collects its own consents on its own form before it holds anything more.

## 4. Role mapping

| `dravya_interest` contains | Dravya roles |
|---|---|
| `collaborator` | `referrer` |
| `stockist` | `referrer` + `stockist` |
| `tell_me_later` | `referrer` |
| (empty) | `referrer` |

`tell_me_later` maps to referrer rather than nothing: the priest has said something real, so
they get the conversation — just not the stockist obligations.

## 5. Responses

| Status | Meaning | What Swadharma should do |
|---|---|---|
| `200` | Lead accepted, or already tracked (idempotent) | Log the returned `reference`, done |
| `401` | Bad or missing signature | Alert. Do not retry — the secret is wrong |
| `503` | Feed not configured on the Dravya side | Alert. Retry later |
| `5xx` | Dravya is having a bad day | Retry with backoff, then give up quietly |

```json
{ "reference": "DRV-EMP-2026-0007", "status": "received", "message": "…" }
```

**Idempotent.** Re-posting the same `reference` — or a different reference for a phone number
that already has a live Dravya application — returns the existing record rather than creating
a second one. Retry freely.

A lead for a country Dravya does not ship to yet returns `200` with `status: "withdrawn"`.
That is an acknowledgement, not an error: it stops the caller retrying forever over something
that will not change today.

## 6. The rule that matters most

**Forwarding is best-effort and must never gate Swadharma's own empanelment.** Fire it after
the Swadharma application is safely stored, off the request path, and swallow the failure.
A priest's standing with Swadharma cannot depend on whether a different service answered its
phone.

```ts
// after the professional_applications row is committed
void forwardToDravya(application).catch((err) => {
  logger.warn({ err, reference }, 'dravya lead forward failed — not blocking');
});
```

## 7. What happens on the Dravya side

The lead becomes a `purohita_applications` row with `source='swadharma'`, status `received`,
and the original payload kept verbatim in `external_payload` for audit. From there it is
reviewed exactly like a direct application: conversation, then a decision, then — only on
approval — a `purohitas` row, a referral code, and a profile page.

Dravya's commission and stockist terms live at **dravya4u.com/purohita/apply** and are not
restated on the Swadharma form. Two sources of truth for a commission rate will drift; one
will not.
