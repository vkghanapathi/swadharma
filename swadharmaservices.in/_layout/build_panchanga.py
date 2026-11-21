#!/usr/bin/env python3
"""
build_panchanga.py — turn Viyat's pañcāṅga tables into the site's calendar data.

Why a build step and not an API call
------------------------------------
Viyat has the tables and an API, but every useful endpoint on
viyat-api-618503459301.asia-south1.run.app answers 403 Not authenticated. A
public marketing page cannot hold a credential, and putting one in the browser
would be worse than having no calendar. So the tables are compiled here, at
build time, into a same-origin static asset. No auth, no CSP change, no runtime
dependency on another service being up.

Source of record
----------------
    viyat/panchangam_data/panchangam_en.json
        385 days, 2026-03-19 (Ugādi, Parābhava) to 2027-04-07. Per day: māsa,
        pakṣa, tithi and its end time, nakṣatra, yoga, karaṇa, sunrise, sunset,
        rāhukāla, varjya, durmuhūrta, and `vishesham` — the printed pañcāṅga's
        own festival line for that day.

What this script adds
---------------------
1.  Normalisation. The source spells tithis as they are recited
    ("dvādaśyāṁ tithau"); the site needs "Dvādaśī" and the number 12, because
    booking by Chandramāna date means matching on the number.
2.  Validation. Unknown vocabulary is a hard error, not a shrug. The source has
    one typo already ("pāḍyami" for pratipat) and a few double spaces; those are
    mapped explicitly below. Anything NOT in the maps stops the build, because a
    tithi silently dropped is a Śrāddha booked on the wrong day.
3.  Derived monthly observances. Amāvāsyā, Pūrṇimā, Ekādaśī, Pradoṣa, Saṅkaṣṭī
    and the rest are rules over (pakṣa, tithi), not entries in a list. Deriving
    them means they stay correct for any year the tables cover.

Times are carried through VERBATIM. The source marks them "M 8.57", "N 5.30",
"E 4.14", "te 5.47" — a convention this repository documents nowhere and which
is not decoded in Viyat either. Guessing whether N means night or noon would
put wrong muhūrta windows in front of people arranging a funeral rite. They are
printed as published; the unambiguous clock ranges (rāhukāla, durmuhūrta) are
the ones the UI reasons about.

    python _layout/build_panchanga.py            # writes panchanga.data.js
    python _layout/build_panchanga.py --check    # exit 1 if it would change
"""

from __future__ import annotations

import json
import os
import re
import sys
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).parent.parent
SOURCE = Path(
    r"C:\Users\Datta\Documents\VK\Code Programming\viyat\panchangam_data\panchangam_en.json"
)
# The Telugu edition of the same tables. Its tithi end times carry unambiguous
# markers (ఉ morning, ప day, సా evening, రా night, తె before dawn); the English
# edition folds ఉ and రా into one "M", so "M 7.00" there is 19:00 as often as
# 07:00. Tithi clock times are read from here (VKG 2026-11-21, Ishti ruling).
SOURCE_TE = SOURCE.with_name("panchangam_te.json")
TARGET = ROOT / "panchanga.data.js"

# The tenant portals need the same table. It is written to both places by this
# one script rather than copied by hand, because two copies of a year of tithis
# drifting apart is the sort of thing nobody notices until a Śrāddha is booked
# on the wrong day. Skipped silently if the portal checkout is not beside this
# one. The portal is swadharma_2026 (the old SSM checkout is frozen, 2026-10-29);
# PANCHANGA_PORTAL_TARGET overrides the path, e.g. from a git worktree.
PORTAL_TARGET = Path(os.environ.get("PANCHANGA_PORTAL_TARGET") or (
    ROOT.parent / "swadharma_2026" / "frontend" / "public" / "panchanga.data.js"
))

# ── Vocabulary ───────────────────────────────────────────────────────────
# Every value the source can hold, mapped to (display name, number). The
# numbers are what booking by Chandramāna date matches on; Amāvāsyā is 30 so
# that "kṛṣṇa 30" sorts after "kṛṣṇa 14" the way the fortnight actually runs.

TITHI = {
    "pratipadi tithau": ("Pratipat", 1),
    "pāḍyami": ("Pratipat", 1),                 # source typo, same tithi
    "dvitīyasyāṁ tithau": ("Dvitīyā", 2),
    "tr̥tīyasyāṁ tithau": ("Tṛtīyā", 3),
    "caturthyāṁ tithau": ("Caturthī", 4),
    "pan̄camyāṁ tithau": ("Pañcamī", 5),
    "ṣaṣṭhyāṁ tithau": ("Ṣaṣṭhī", 6),
    "saptamyāṁ tithau": ("Saptamī", 7),
    "aṣṭamyāṁ tithau": ("Aṣṭamī", 8),
    "navamyāṁ tithau": ("Navamī", 9),
    "daśamyāṁ tithau": ("Daśamī", 10),
    "ēkādaśyāṁ tithau": ("Ekādaśī", 11),
    "dvādaśyāṁ tithau": ("Dvādaśī", 12),
    "trayōdaśyāṁ tithau": ("Trayodaśī", 13),
    "caturdaśyāṁ tithau": ("Caturdaśī", 14),
    "paurṇamāsyāṁ tithau": ("Pūrṇimā", 15),
    "paurṇamyāṁ": ("Pūrṇimā", 15),              # source variant, 2027-02-20 only
    "amāvāsyāyāṁ tithau": ("Amāvāsyā", 30),
}

PAKSHA = {"śukla": "Śukla", "kr̥ṣṇa": "Kṛṣṇa"}

MASA = {
    "caitra": ("Caitra", 1, False),
    "vaiśākha": ("Vaiśākha", 2, False),
    "nija jyēṣṭha": ("Jyeṣṭha", 3, False),
    "adhika jyēṣṭha": ("Jyeṣṭha", 3, True),     # intercalary — see ADHIKA note
    "āṣāḍha": ("Āṣāḍha", 4, False),
    "śrāvaṇa": ("Śrāvaṇa", 5, False),
    "bhādrapada": ("Bhādrapada", 6, False),
    "āśvayuja": ("Āśvayuja", 7, False),
    "kārtika": ("Kārtika", 8, False),
    "mārgaśira": ("Mārgaśira", 9, False),
    "puṣya": ("Puṣya", 10, False),
    "māgha": ("Māgha", 11, False),
    "phālguṇa": ("Phālguṇa", 12, False),
}

# The source has no adhika marker on the month it duplicates, so a year with an
# adhika māsa carries both "adhika jyēṣṭha" and "nija jyēṣṭha". Booking a
# Śrāddha or a saṃskāra in the adhika month is not the same as booking it in the
# nija month, so the flag is kept and surfaced rather than flattened away.

NAKSHATRA_FIX = {"puṣyamī": "Puṣya"}   # source spelling; everything else title-cases

WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]


# ── Derived monthly observances ──────────────────────────────────────────
# (paksha, tithi_number) -> entries. `service` is a slug in catalogue.js, so a
# day in the calendar links straight to the rite that serves it. `kala` is the
# part of the day the observance belongs to, as the pañcāṅga states it.
#
# These are the "monthly programmes": rules over the lunar day, not a list
# somebody retypes each year.

MONTHLY = {
    # Amāvāsyā is not here: it is a clock-window rule now (TIME_RULES below).
    ("Śukla", 15): [{
        "name": "Pūrṇimā — Satyanārāyaṇa Vratam",
        "short": "Pūrṇimā",
        "service": "ceremonies",
        "kala": "Pradoṣa",
        "note": "Household vratam, performed in the evening.",
    }],
    ("Śukla", 11): [{
        "name": "Śukla Ekādaśī",
        "short": "Ekādaśī",
        "service": "ceremonies",
        "kala": "Whole day",
        "note": "Upavāsa. Pāraṇa on Dvādaśī the following morning.",
    }],
    ("Kṛṣṇa", 11): [{
        "name": "Kṛṣṇa Ekādaśī",
        "short": "Ekādaśī",
        "service": "ceremonies",
        "kala": "Whole day",
        "note": "Upavāsa. Pāraṇa on Dvādaśī the following morning.",
    }],
    ("Śukla", 13): [{
        "name": "Pradoṣa",
        "short": "Pradoṣa",
        "service": "ceremonies",
        "kala": "Pradoṣa",
        "note": "Śiva abhiṣeka in the twilight hour before and after sunset.",
    }],
    ("Kṛṣṇa", 13): [{
        "name": "Pradoṣa",
        "short": "Pradoṣa",
        "service": "ceremonies",
        "kala": "Pradoṣa",
        "note": "Śiva abhiṣeka in the twilight hour before and after sunset.",
    }],
    ("Kṛṣṇa", 14): [{
        "name": "Māsa Śivarātri",
        "short": "Māsa Śivarātri",
        "service": "ceremonies",
        "kala": "Pradoṣa",
        # Viyat's own rule engine draws this distinction explicitly: the monthly
        # observance is at pradoṣa, only the annual Mahāśivarātri is at niśītha.
        "note": "Caturdaśī at pradoṣa — the monthly observance, not the annual "
                "Mahāśivarātri, which is reckoned at midnight.",
    }],
    ("Kṛṣṇa", 4): [{
        "name": "Saṅkaṣṭa Hara Caturthī",
        "short": "Saṅkaṣṭī",
        "service": "ceremonies",
        "kala": "Candrodaya",
        "note": "Fast broken at moonrise.",
    }],
    ("Śukla", 4): [{
        "name": "Vināyaka Caturthī",
        "short": "Vināyaka Caturthī",
        "service": "ceremonies",
        "kala": "Madhyāhna",
        "note": "Monthly Gaṇapati observance.",
    }],
    ("Kṛṣṇa", 8): [{
        "name": "Kālāṣṭamī",
        "short": "Aṣṭamī",
        "service": "ceremonies",
        "kala": "Rātri",
        "note": "Monthly Bhairava observance.",
    }],
    ("Śukla", 6): [{
        "name": "Skanda Ṣaṣṭhī",
        "short": "Ṣaṣṭhī",
        "service": "ceremonies",
        "kala": "Madhyāhna",
        "note": "Monthly Subrahmaṇya observance.",
    }],
}

# ── Clock-window observances (VKG 2026-11-21) ────────────────────────────
# Some rites are owed on the day a tithi is PRESENT during a stretch of clock
# time, not on the day it holds at sunrise:
#
#   "Ishti will be performed between 7-1 PM; if Pratipat is present during
#    that time, we will perform on that day."
#   "Amaavaasya = Pinda Pitru Yajna, Tarpanam; if Amaavaasya present from
#    12 Noon."
#
# `at` is a moment the tithi must cover; `during` is a window it must touch.
# Times are minutes from local midnight, Mysore (the table's locality).
# `code` is what other programs match on (the portal's Ishti Seva slots).
TIME_RULES = [
    {
        "tithi": 1,                       # Pratipat, either pakṣa
        "during": (7 * 60, 13 * 60),
        "ob": {
            "code": "ISHTI",
            "name": "Pratipat — Iṣṭi",
            "short": "Iṣṭi",
            "service": "ceremonies",
            "kala": "7 AM – 1 PM",
            "note": "Iṣṭi is performed between 7 AM and 1 PM, on the day "
                    "Pratipat is present in that window.",
        },
    },
    {
        "tithi": 30,                      # Amāvāsyā
        "at": 12 * 60,
        "ob": {
            "code": "PINDA_PITR_YAJNA",
            "name": "Amāvāsyā — Piṇḍa Pitṛ Yajña & Tarpaṇam",
            "short": "Piṇḍa Pitṛ Yajña",
            "service": "shraaddha",
            "kala": "From 12 noon",
            "note": "On the day Amāvāsyā is present at 12 noon.",
        },
    },
]

# Telugu time markers -> how a printed "h.mm" becomes minutes from the day's
# own midnight. Checked against the whole table: with this reading 388 of 391
# consecutive tithi durations fall in 18.5–27.5 hours; the other three sit
# beside two source slips (2026-08-01, 2026-09-26), which are reported.
TE_MARK = {
    "ఉ": lambda h: h,                             # udayaṁ, morning
    "ప": lambda h: h if h >= 11 else h + 12,      # pagalu, midday
    "మ": lambda h: h if h >= 11 else h + 12,      # madhyāhnaṁ
    "సా": lambda h: h + 12,                       # sāyaṁ, evening
    "రా": lambda h: h + 12 if h >= 6 else h + 24,  # rātri, night (past 12 = next day)
    "తె": lambda h: h + 24,                       # tellavāru, before next dawn
}
TE_TIME_RE = re.compile(r"^(\S+)\s+(\d{1,2})[.,](\d{2})")
TE_FULL = "పూర్తి"     # pūrti: the tithi runs past the next sunrise


def te_minutes(value: str | None) -> int | None | str:
    """Minutes from the day's midnight; None for pūrti; "?" when unreadable."""
    v = norm(value)
    if not v:
        return "?"
    if v.startswith(TE_FULL):
        return None
    m = TE_TIME_RE.match(v)
    if not m or m.group(1) not in TE_MARK:
        return "?"
    return TE_MARK[m.group(1)](int(m.group(2))) * 60 + int(m.group(3))


def clock(minutes: int) -> str:
    """'19:00', or '05:07 (+1)' for a time after the following midnight."""
    plus, rest = divmod(minutes, 24 * 60)
    return f"{rest // 60:02d}:{rest % 60:02d}" + (f" (+{plus})" if plus else "")


def apply_time_rules(days: "OrderedDict[str, dict]", te: dict) -> None:
    """Tithi clock times from the Telugu edition, then the TIME_RULES."""
    ordered = list(days)
    ends = []          # (absolute minute, tithi number), in order
    unreadable = set()
    for i, date in enumerate(ordered):
        day, row = days[date], te.get(date, {})
        for key, tn, out in (("tithiTime1", day["tn"], "tiEndMin"),
                             ("tithiTime2", day.get("tn2"), "ti2EndMin")):
            if tn is None:
                continue
            m = te_minutes(row.get(key))
            if m == "?":
                unreadable.add(i)
                warnings.append(f"{date}: Telugu {key} {row.get(key)!r} unreadable — "
                                "clock-window rules skip the days beside it")
                continue
            if m is None:       # pūrti: no end on this day
                continue
            day[out] = m
            ends.append((i * 1440 + m, tn, i))

    # A tithi runs from the previous end to its own. A duration outside any
    # real tithi means a misprint on one side: both neighbours are unsafe.
    segments = []
    for (a, _, ia), (b, tn, ib) in zip(ends, ends[1:]):
        hours = (b - a) / 60
        if not 18.5 <= hours <= 27.5:
            unreadable.update({ia, ib})
            warnings.append(f"{ordered[ia]}..{ordered[ib]}: a tithi of {hours:.1f} h — "
                            "misprint upstream; clock-window rules skip these days")
            continue
        segments.append((a, b, tn, ia, ib))

    for i, date in enumerate(ordered):
        day0 = i * 1440
        for rule in TIME_RULES:
            if "at" in rule:
                lo = hi = day0 + rule["at"]
            else:
                lo, hi = day0 + rule["during"][0], day0 + rule["during"][1]
            if lo == hi:      # present AT a moment
                hits = [s for s in segments if s[2] == rule["tithi"] and s[0] <= lo < s[1]]
            else:             # present at any time DURING a window
                hits = [s for s in segments if s[2] == rule["tithi"] and s[0] < hi and s[1] > lo]
            if not hits:
                continue
            if any(j in unreadable for s in hits for j in (s[3], s[4])):
                continue
            a, b = hits[0][0], hits[0][1]
            entry = dict(rule["ob"])
            entry["tithiFrom"] = clock(a - day0) if a >= day0 else clock(a - day0 + 1440) + " (-1)"
            entry["tithiTo"] = clock(b - day0)
            days[date].setdefault("ob", []).append(entry)


# Mahālaya Pakṣa — the whole dark fortnight of Bhādrapada, when Śrāddha is owed
# for every ancestor rather than one. A pakṣa-level rule, not a tithi one.
MAHALAYA = {
    "name": "Mahālaya Pakṣa — Śrāddha",
    "short": "Mahālaya",
    "service": "shraaddha",
    "kala": "Aparāhṇa",
    "note": "The fortnight in which Śrāddha is offered to all ancestors.",
}

problems: list[str] = []   # hard: stop the build
warnings: list[str] = []   # soft: drop the field, say so
repairs: list[str] = []    # recovered, and verified against neighbouring days

import re

TIME_RE = re.compile(r"^\d{1,2}[.:]\d{2}$")            # well formed: 6.09
SHORT_RE = re.compile(r"^(\d{1,2})(?:[.:](\d))?$")     # damaged: "6" or "6.1"
RANGE_RE = re.compile(r"^\d{1,2}[.:]\d{1,2}\s*-\s*\d{1,2}[.:]\d{1,2}$")

# ── Recovering truncated sunrise and sunset times ────────────────────────
# 56 of the 770 sunrise/sunset cells lost a trailing zero somewhere upstream —
# a spreadsheet treating 6.10 as the number 6.1. The surrounding days settle
# what they were, and they settle it beyond argument:
#
#     sunset  18.49  18.49  [18.5] [18.5] [18.5] [18.5]  18.51  18.51
#     sunrise  6.09  [6.1]  [6.1]  [6.1]  [6.1]  [6.1]    6.11
#     sunrise  6.01  6.01   [6]    [6]    [6]     5.59
#
# "18.5" sitting between 18.49 and 18.51 is 18:50, not 18:05. So these are
# recovered rather than dropped — but every recovery is CHECKED, not assumed.
# Where a value has two possible readings (6.1 is either 6:01 or 6:10) both are
# measured against the nearest well-formed day, and the winner must be close to
# it AND clearly closer than the alternative. Anything failing either test is
# dropped and reported, as is anything unrecoverable: one row has a rāśi name
# ("kumbhaṁ") sitting in the sunrise column, and no arithmetic fixes that.

NEAR_DAYS = 4        # how far to look for a well-formed neighbour
MAX_DRIFT = 6        # minutes; a sunrise moves about one minute a day
MIN_MARGIN = 3       # minutes the winning reading must beat the other by

# A well-formed time can still be the wrong cell. One row (2027-02-20) has its
# columns shifted: a rāśi name in sunrise, and 7.41 in sunset — which parses
# perfectly and would have been published as a sunset just before eight in the
# morning. Across the whole year the real values sit in 5:57–6:49 and
# 17:54–18:52, so these windows are wide enough to be no constraint on genuine
# data and narrow enough to catch a shifted row.
PLAUSIBLE = {
    "sunrise": (5 * 60, 7 * 60 + 30),
    "sunset": (17 * 60, 19 * 60 + 30),
}


def to_minutes(value: str) -> "int | None":
    if not TIME_RE.match(value):
        return None
    h, mm = re.split(r"[.:]", value)
    return int(h) * 60 + int(mm)


def plausible(field: str, minutes: "int | None") -> bool:
    """Is this a time of day the field could actually hold?"""
    if minutes is None:
        return False
    window = PLAUSIBLE.get(field)
    return window is None or window[0] <= minutes <= window[1]


def neighbour_minutes(src: dict, dates: list, index: int, field: str) -> "int | None":
    """The nearest well-formed, plausible value for this field within NEAR_DAYS.

    Plausibility matters here and not only at output: the day beside a damaged
    cell can itself be the shifted row, and anchoring a repair to 7:41 would
    turn one bad cell into three."""
    for gap in range(1, NEAR_DAYS + 1):
        for j in (index - gap, index + gap):
            if 0 <= j < len(dates):
                got = to_minutes(" ".join((src[dates[j]].get(field) or "").split()))
                if plausible(field, got):
                    return got
    return None


def recover(value: str, src: dict, dates: list, index: int, field: str):
    """(repaired, explanation) on success, (None, reason) on refusal."""
    m = SHORT_RE.match(value)
    if not m:
        return None, "not a time at all"

    hour, minute_digit = m.group(1), m.group(2)
    if minute_digit is None:
        candidates = [hour + ".00"]                        # "6" -> 6:00
    else:
        candidates = [hour + "." + minute_digit + "0",     # "6.1" -> 6:10
                      hour + ".0" + minute_digit]          # "6.1" -> 6:01

    anchor = neighbour_minutes(src, dates, index, field)
    if anchor is None:
        return None, "no well-formed neighbouring day to check against"

    scored = sorted((abs(to_minutes(c) - anchor), c) for c in candidates)
    best_gap, best = scored[0]

    if best_gap > MAX_DRIFT:
        return None, f"best reading {best} is {best_gap} min off the neighbouring day"
    if len(scored) > 1 and scored[1][0] - best_gap < MIN_MARGIN:
        return None, f"{scored[0][1]} and {scored[1][1]} are equally plausible"

    return best, f"{value!r} -> {best} (neighbour within {best_gap} min)"


def norm(value: str | None) -> str:
    """Collapse the double spaces the source carries in a few nakṣatra names."""
    return " ".join((value or "").split())


def title(value: str) -> str:
    v = norm(value)
    return NAKSHATRA_FIX.get(v, v[:1].upper() + v[1:] if v else "")


def strip_suffix(value: str, suffix: str) -> str:
    v = norm(value)
    return norm(v[: -len(suffix)]) if v.endswith(suffix) else v


def build() -> dict:
    if not SOURCE.is_file():
        raise SystemExit(
            f"Viyat pañcāṅga not found at:\n  {SOURCE}\n"
            "This build needs the viyat checkout beside swadharma. Nothing was written."
        )

    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    days: "OrderedDict[str, dict]" = OrderedDict()
    counts = {"observances": 0, "vishesham": 0, "adhika": 0}

    ordered = sorted(src)

    for index, date in enumerate(ordered):
        row = src[date]

        raw_masa = norm(row.get("masam"))
        raw_paksha = norm(row.get("paksham"))
        raw_tithi = norm(row.get("tithi1"))

        if raw_masa not in MASA:
            problems.append(f"{date}: unknown māsa {raw_masa!r}")
            continue
        if raw_paksha not in PAKSHA:
            problems.append(f"{date}: unknown pakṣa {raw_paksha!r}")
            continue
        if raw_tithi not in TITHI:
            problems.append(f"{date}: unknown tithi {raw_tithi!r}")
            continue

        masa_name, masa_no, adhika = MASA[raw_masa]
        paksha = PAKSHA[raw_paksha]
        tithi_name, tithi_no = TITHI[raw_tithi]
        if adhika:
            counts["adhika"] += 1

        day: dict = {
            "w": WEEKDAY[int(row.get("dayOfWeek", 0)) % 7],
            "ms": masa_name,
            "mn": masa_no,
            "pk": paksha,
            "ti": tithi_name,
            "tn": tithi_no,
            "nk": title(strip_suffix(row.get("nakshatram1", ""), "nakṣatrē")),
        }
        if adhika:
            day["adhika"] = True

        # Optional fields. A gap in the printed table is not a reason to drop
        # the day, so anything missing is simply absent from the output and the
        # day stays bookable.
        for out_key, src_key, pattern in (
            ("tiEnd", "tithiTime1", None),
            ("nkEnd", "nakshatramTime1", None),
            ("sr", "sunrise", TIME_RE),
            ("ss", "sunset", TIME_RE),
            ("rk", "rahukalam", RANGE_RE),
            ("yo", "yogam", None),
            ("ka", "karanam", None),
        ):
            value = norm(row.get(src_key))
            if not value:
                continue

            if pattern and not pattern.match(value):
                # Sunrise and sunset can often be recovered from the days on
                # either side; nothing else can, and nothing is guessed.
                if pattern is TIME_RE:
                    fixed, why = recover(value, src, ordered, index, src_key)
                    if fixed:
                        repairs.append(f"{date}: {src_key} {why}")
                        day[out_key] = fixed
                        continue
                    warnings.append(f"{date}: {src_key} is {value!r} — dropped, {why}")
                else:
                    warnings.append(f"{date}: {src_key} is {value!r}, not a time — dropped")
                continue

            # Well formed is not the same as right — see the shifted row noted
            # against PLAUSIBLE.
            if src_key in PLAUSIBLE and not plausible(src_key, to_minutes(value)):
                warnings.append(
                    f"{date}: {src_key} is {value!r}, outside any plausible "
                    f"{src_key} for this latitude — dropped, the row's columns look shifted"
                )
                continue

            day[out_key] = value

        # A second tithi means the lunar day changes again before sunrise —
        # 14 days in this year. Carried so the calendar can say so.
        second = norm(row.get("tithi2"))
        if second:
            if second not in TITHI:
                problems.append(f"{date}: unknown second tithi {second!r}")
            else:
                day["ti2"] = TITHI[second][0]
                day["tn2"] = TITHI[second][1]
                if norm(row.get("tithiTime2")):
                    day["ti2End"] = norm(row.get("tithiTime2"))

        # Durmuhūrta — plain clock ranges, so the UI can reason about these.
        dm = []
        for start, end in (("dmStart1", "dmEnd1"), ("dmStart2", "dmEnd2")):
            s, e = norm(row.get(start)), norm(row.get(end))
            if s and e:
                dm.append(f"{s} – {e}")
        if dm:
            day["dm"] = dm

        # Varjya — carried verbatim; the source mixes markers into these.
        vj = [norm(row.get(k)) for k in ("varjyamStart1", "varjyamStart2")]
        vj = [v for v in vj if v]
        if vj:
            day["vj"] = vj

        # Observances: the printed pañcāṅga's own line, then the derived rules.
        observances = []

        printed = norm(row.get("vishesham"))
        if printed:
            counts["vishesham"] += 1
            day["vs"] = printed

        for entry in MONTHLY.get((paksha, tithi_no), []):
            observances.append(entry)

        # A kṣaya tithi never holds at sunrise, so a rule that looked only at
        # tithi1 would drop that month's observance without saying anything.
        # Māgha Pūrṇimā 2027 is exactly this case: Caturdaśī all day, Pūrṇimā
        # from te 5.30, and Kṛṣṇa Pratipat by the next sunrise — one month of
        # Satyanārāyaṇa Vratam quietly missing. Observances on the second tithi
        # are carried, and flagged, so the day is offered with its caveat rather
        # than not offered at all.
        if day.get("tn2"):
            for entry in MONTHLY.get((paksha, day["tn2"]), []):
                late = dict(entry)
                late["late"] = True
                late["lateFrom"] = day.get("ti2End", "")
                observances.append(late)

        if masa_name == "Bhādrapada" and paksha == "Kṛṣṇa" and not adhika:
            observances.append(MAHALAYA)

        if observances:
            day["ob"] = observances
            counts["observances"] += len(observances)

        days[date] = day

    # Clock-window observances need the Telugu edition's tithi times.
    if SOURCE_TE.is_file():
        apply_time_rules(days, json.loads(SOURCE_TE.read_text(encoding="utf-8")))
    else:
        problems.append(f"Telugu pañcāṅga not found at {SOURCE_TE}; Iṣṭi and Amāvāsyā days cannot be reckoned")

    dates = list(days)
    return {
        "meta": {
            # ── Locality is not decoration ────────────────────────────────
            # A tithi is not a global fact. It begins and ends at a moment in
            # time, and which tithi is current AT SUNRISE — the reckoning most
            # rites use — depends on where you are standing. Rāhukāla, varjya,
            # durmuhūrta and the sunrise and sunset themselves are all local.
            #
            # These tables are computed for Mysore. Two independent
            # confirmations: the publisher says so in its own front matter
            # ("Though the time is set to IST, Sunrise and Sunset indicate
            # Mysore time"), and the data agrees — the longest day in the year
            # is 12h51m and the shortest 11h24m, which is latitude 12.3 N.
            #
            # Every surface that shows a tithi must therefore say whose tithi it
            # is. A family in Frisco reading "Rāhukāla 7.30 - 9.00" without that
            # label is reading Mysore's rāhukāla and does not know it.
            "locality": {
                "name": "Mysore",
                "region": "Karnataka, India",
                "timezone": "Asia/Kolkata",
                "tzLabel": "IST",
                "note": "Sunrise, sunset and every muhūrta window below are "
                        "reckoned for Mysore. Tithi is given as it stands at "
                        "Mysore sunrise.",
            },
            "samvatsara": "Parābhava",
            "from": dates[0],
            "to": dates[-1],
            "days": len(dates),
            "source": "SGS Pañcāṅgam via Viyat (panchangam_en.json)",
            "timesVerbatim": (
                "Tithi and nakṣatra end times are printed exactly as the pañcāṅga "
                "gives them, markers and all. Rāhukāla and durmuhūrta are plain "
                "clock ranges."
            ),
        },
        "days": days,
        "_counts": counts,
    }


def main() -> int:
    check = "--check" in sys.argv
    data = build()
    counts = data.pop("_counts")

    if problems:
        print(f"FAILED — {len(problems)} vocabulary problem(s); nothing written:")
        for p in problems[:25]:
            print("  X " + p)
        return 1

    # Emitted as JavaScript, not JSON, and the reason is Firebase Hosting.
    # swadharmaservices.in is fronted by Firebase, which re-serves an origin
    # application/json response UNCOMPRESSED — measured: 146 KB to the browser
    # where the Cloud Run origin had already gzipped it to 21 KB. It does
    # compress application/javascript. Same bytes, same parse, one seventh the
    # transfer, and no misleading content type on a .json file.
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"), sort_keys=False)
    text = (
        "/* Generated by _layout/build_panchanga.py from Viyat's tables. Do not edit. */\n"
        "window.SW_PANCHANGA_DATA=" + body + ";\n"
    )

    current = TARGET.read_text(encoding="utf-8") if TARGET.is_file() else None

    if check:
        stale = []
        if current != text:
            stale.append("panchanga.data.js")
        if PORTAL_TARGET.parent.is_dir() and (
            not PORTAL_TARGET.is_file()
            or PORTAL_TARGET.read_text(encoding="utf-8") != text
        ):
            stale.append(str(PORTAL_TARGET))
        if stale:
            print("Stale (run python _layout/build_panchanga.py): " + ", ".join(stale))
            return 1
        print("panchanga.data.js up to date.")
        return 0

    portal_current = (
        PORTAL_TARGET.read_text(encoding="utf-8") if PORTAL_TARGET.is_file() else None
    )
    portal_stale = PORTAL_TARGET.parent.is_dir() and portal_current != text

    if current == text and not portal_stale:
        print("panchanga.data.js unchanged.")
        return 0

    if current != text:
        with open(TARGET, "w", encoding="utf-8", newline="") as fh:
            fh.write(text)

    if portal_stale:
        with open(PORTAL_TARGET, "w", encoding="utf-8", newline="") as fh:
            fh.write(text)
        print(f"Also wrote {PORTAL_TARGET}")

    meta = data["meta"]
    print(
        f"Wrote panchanga.data.js — {meta['days']} days {meta['from']} to {meta['to']}, "
        f"{counts['observances']} derived observances, "
        f"{counts['vishesham']} days with a printed pañcāṅga note, "
        f"{counts['adhika']} adhika-māsa days, "
        f"{len(text) / 1024:.0f} KB"
    )
    if repairs:
        print(f"\n{len(repairs)} truncated time(s) recovered and checked against "
              "the neighbouring days:")
        for r in repairs[:6]:
            print("  + " + r)
        if len(repairs) > 6:
            print(f"  + … and {len(repairs) - 6} more of the same kind")

    if warnings:
        print(f"\n{len(warnings)} damaged cell(s) that could NOT be recovered, dropped:")
        for w in warnings:
            print("  ! " + w)

    if repairs or warnings:
        print("\n  All of the above are upstream data faults. Worth correcting in")
        print("  viyat/panchangam_data/panchangam_en.json so the repair step can go away.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
