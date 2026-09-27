"""Rule-based understanding. Runs before (and often instead of) the LLM."""

import re
from dataclasses import dataclass

from app.agents.common import lexicon as lx

# Letters (any script) plus Indic vowel signs, spaces and . ' -  — same
# strings the Node validator accepts with \p{L}\p{M}.
NAME_RE = re.compile(r"^[^\W\d_](?:[^\W\d_]|[ऀ-෿]|[ .'-]){1,79}$")


@dataclass
class IncomeResult:
    bracket: str | None
    amount: int | None = None
    period: str | None = None


def normalise(text: str) -> str:
    return " ".join(lx.nfc(text).translate(lx.DIGITS).lower().split())


def _word(w: str) -> str:
    # Indic vowel signs aren't \w, so both edges also exclude the Indic
    # blocks: "ना" must not match the end of "जुड़ना".
    return rf"(?<![\w\u0900-\u0DFF]){re.escape(w)}(?![\w\u0900-\u0DFF])"


def _has(words, text: str) -> bool:
    return any(re.search(_word(w), text) for w in words)


def bracket_for(yearly: int) -> str:
    if yearly < 100_000:
        return "lt_1l"
    if yearly < 250_000:
        return "1l_2_5l"
    if yearly < 500_000:
        return "2_5l_5l"
    if yearly < 1_000_000:
        return "5l_10l"
    return "gt_10l"


_AMOUNT = re.compile(r"(\d+(?:[.,]\d+)*)\s*([^\d\s,.?!।]+)?")
_JOINER = re.compile(r"^[\s,]*(?:and|aur|और|व|আর|மற்றும்|మరియు)?[\s,]*$")
_PERIODS = {"day": 300, "week": 52, "month": 12, "year": 1}  # × to get a yearly amount
# Used by parse_income: unchanged from before the shared common/ move.
_UNIT_RANK = {**{u: 1 for u in lx.THOUSAND}, **{u: 2 for u in lx.LAKH}, **{u: 3 for u in lx.CRORE}}
_UNIT_VALUE = {1: 1_000, 2: 100_000, 3: 10_000_000}

# parse_amount only: also understands "hundred" and the "hazaar" spelling.
# Kept separate from _UNIT_RANK/_UNIT_VALUE above so parse_income's behaviour
# (bracket, amount, period) stays byte-identical to before this module moved.
_AMOUNT_UNIT_RANK = {
    **{u: 1 for u in lx.HUNDRED},
    **{u: 2 for u in (*lx.THOUSAND, "hazaar")},
    **{u: 3 for u in lx.LAKH},
    **{u: 4 for u in lx.CRORE},
}
_AMOUNT_UNIT_VALUE = {1: 100, 2: 1_000, 3: 100_000, 4: 10_000_000}


def _spell_before(t: str, follow: set[str], numbers: dict | None = None) -> str:
    """Replace a spelled number with digits when the very next word is in `follow`."""
    numbers = lx.NUMBER_WORDS if numbers is None else numbers
    words = t.split()
    for i, w in enumerate(words[:-1]):
        if w in numbers and words[i + 1] in follow:
            words[i] = str(numbers[w])
    return " ".join(words)


def _spell_numbers(t: str) -> str:
    """'पंद्रह हज़ार' → '15 हज़ार' (only right before thousand/lakh/crore words)."""
    return _spell_before(t, set(_UNIT_RANK))


def _amounts(
    t: str,
    assume_money: bool = False,
    unit_rank: dict | None = None,
    unit_value: dict | None = None,
    skip_units: set[str] | None = None,
    merge_trailing: bool = False,
) -> list[dict]:
    """Numbers (with their thousand/lakh/... unit) said in `t`.

    `skip_units` and `merge_trailing` are parse_amount-only: parse_income
    calls with neither, so its behaviour is unchanged. A number whose next
    word is in `skip_units` ("2 घंटे") is not an amount; with
    `merge_trailing`, a plain number right after a unit joins it
    ("2 hazaar 500" → 2500, "2 सौ 50" → 250).
    """
    unit_rank = _UNIT_RANK if unit_rank is None else unit_rank
    unit_value = _UNIT_VALUE if unit_value is None else unit_value
    money = assume_money or _has(lx.MONEY, t) or "₹" in t
    found = []
    for m in _AMOUNT.finditer(t):
        raw, unit = m.group(1), (m.group(2) or "")
        try:
            value = float(raw.replace(",", ""))
        except ValueError:
            continue
        if skip_units and unit in skip_units:
            continue  # "500 for 2 hours": the 2 is a time, not money
        rank = unit_rank.get(unit, 0)
        end = m.end() if rank else m.end(1)
        if not rank:
            digits = raw.replace(",", "").split(".")[0]
            if len(digits) >= 10:
                continue  # a phone number
            if len(digits) == 4 and 1900 <= value <= 2099 and not money:
                continue  # a year ("since 2019")
            if len(digits) == 6 and "," not in raw and not money:
                continue  # a PIN code
        found.append(
            {
                "value": value * unit_value.get(rank, 1),
                "rank": rank,
                "start": m.start(),
                "end": end,
            }
        )
    # "2 लाख 50 हज़ार" → 2,50,000: join a bigger unit followed by a smaller one.
    merged: list[dict] = []
    for a in found:
        prev = merged[-1] if merged else None
        if prev and prev["rank"] > a["rank"] > 0 and _JOINER.match(t[prev["end"] : a["start"]]):
            prev["value"] += a["value"]
            prev["rank"] = a["rank"]
            prev["end"] = a["end"]
        elif (
            merge_trailing
            and prev
            and prev["rank"] > 0
            and a["rank"] == 0
            and a["value"] < unit_value[prev["rank"]]
            and _JOINER.match(t[prev["end"] : a["start"]])
        ):
            prev["value"] += a["value"]
            prev["rank"] = 0  # nothing smaller can follow a plain number
            prev["end"] = a["end"]
        else:
            merged.append(dict(a))
    return merged


def _period_near(t: str, start: int, end: int) -> str | None:
    """The pay period said right after the amount, else the last one before it."""
    hits = []
    for kind, words in (("day", lx.DAY), ("week", lx.WEEK), ("month", lx.MONTH), ("year", lx.YEAR)):
        for w in words:
            for m in re.finditer(_word(w), t):
                hits.append((m.start(), kind))
    after = sorted(h for h in hits if h[0] >= end)
    if after:
        return after[0][1]
    before = sorted(h for h in hits if h[0] < start)
    return before[-1][1] if before else None


def parse_income(text: str) -> IncomeResult:
    t = _spell_numbers(normalise(text))
    daily = _has(lx.DAY, t) or _has(lx.WEEK, t)
    amounts = [a for a in _amounts(t) if a["value"] >= (100 if daily else 500)]
    if not amounts:
        return IncomeResult(None)
    chosen = amounts[-1]  # "2 lakh, no, 6 lakh" → the correction wins
    amount = int(chosen["value"])
    period = _period_near(t, chosen["start"], chosen["end"])
    if period is None:
        # People quote monthly pay; big round numbers are usually yearly.
        period = "month" if amount <= 50_000 else "year"
    return IncomeResult(bracket_for(amount * _PERIODS[period]), amount, period)


# ── parse_amount / parse_duration only ──────────────────────────────────────
# Everything below is local to these two parsers: parse_income (onboarding)
# never reads these tables, so its behaviour stays exactly as it was.

# Number words the shared lexicon lacks: "one" forms used before a unit
# ("an hour", "ஒரு நாள்", "ఒక గంట"), romanised Hindi, and 6-9 in a few scripts.
_EXTRA_NUMBER_WORDS = {
    lx.nfc(k).lower(): v
    for k, v in {
        "a": 1,
        "an": 1,
        "ek": 1,
        "do": 2,
        "teen": 3,
        "char": 4,
        "chaar": 4,
        "paanch": 5,
        "panch": 5,
        "chhe": 6,
        "saat": 7,
        "aath": 8,
        "nau": 9,
        "das": 10,
        "bees": 20,
        "pachas": 50,
        "सहा": 6,
        "नऊ": 9,
        "ছয়": 6,
        "সাত": 7,
        "আট": 8,
        "ஒரு": 1,
        "ஆறு": 6,
        "ஏழு": 7,
        "எட்டு": 8,
        "ஒன்பது": 9,
        "ఒక": 1,
        "ఆరు": 6,
        "ఏడు": 7,
        "ఎనిమిది": 8,
        "తొమ్మిది": 9,
    }.items()
}
# "hundred" is a unit here ("five hundred"), never a number word on its own.
_AMOUNT_NUMBER_WORDS = {
    k: v for k, v in {**lx.NUMBER_WORDS, **_EXTRA_NUMBER_WORDS}.items() if k != "hundred"
}
# Extra "hundred" spellings, plus one-word hundreds ("पाचशे", "পাঁচশো",
# "ஐநூறு") rewritten to "<n> hundred" before parsing.
_AMOUNT_HUNDRED_EXTRA = {lx.nfc(w).lower() for w in ("sau", "hundreds", "వందల", "వందలు")}
_HUNDRED_COMPOUNDS = {
    lx.nfc(k).lower(): v
    for k, v in {
        "एकशे": 1,
        "दोनशे": 2,
        "तीनशे": 3,
        "चारशे": 4,
        "पाचशे": 5,
        "सहाशे": 6,
        "सातशे": 7,
        "आठशे": 8,
        "नऊशे": 9,
        "शंभर": 1,
        "একশো": 1,
        "একশ": 1,
        "দুশো": 2,
        "দুইশো": 2,
        "তিনশো": 3,
        "চারশো": 4,
        "পাঁচশো": 5,
        "পাঁচশ": 5,
        "ছয়শো": 6,
        "ছশো": 6,
        "সাতশো": 7,
        "আটশো": 8,
        "নয়শো": 9,
        "இருநூறு": 2,
        "முந்நூறு": 3,
        "முன்னூறு": 3,
        "நானூறு": 4,
        "நாநூறு": 4,
        "ஐநூறு": 5,
        "ஐந்நூறு": 5,
        "அறுநூறு": 6,
        "எழுநூறு": 7,
        "எண்ணூறு": 8,
        "தொள்ளாயிரம்": 9,
        "నూరు": 1,
    }.items()
}
_AMOUNT_UNITS = {**_AMOUNT_UNIT_RANK, **{u: 1 for u in _AMOUNT_HUNDRED_EXTRA}}
# Unit words that mean "one of them" when said alone ("सौ रुपये", "వంద").
# Not "k", which is too easily a stray letter.
_BARE_UNITS = {u for u, r in _AMOUNT_UNITS.items() if r in (1, 2) and u != "k"}
# Time units: a number right before one is a duration, not a price.
_DURATION_COUNT_DAY = {
    lx.nfc(w).lower()
    for w in ("day", "days", "din", "दिन", "दिवस", "দিন", "நாள்", "நாட்கள்", "రోజు", "రోజులు")
}
_TIME_UNITS = set(lx.HOUR) | set(lx.MINUTE) | _DURATION_COUNT_DAY
# Sentence punctuation, but not inside a number ("1,500", "1.5").
_PUNCT = re.compile(r"(?<!\d)[,.?!।]|[,.?!।](?!\d)")


_NUMERIC = re.compile(r"^\d+(?:[.,]\d+)*$")


def _depunct(t: str) -> str:
    return " ".join(_PUNCT.sub(" ", t).split())


def _spell_after(t: str, after: set[str], numbers: dict) -> str:
    """Replace a spelled tens number with digits when the word before is in
    `after` ("2 सौ पचास" → "2 सौ 50"). Tens only: "पाँच सौ दो" is "give 500"."""
    words = t.split()
    for i in range(1, len(words)):
        if words[i - 1] in after and numbers.get(words[i], 0) >= 10:
            words[i] = str(numbers[words[i]])
    return " ".join(words)


def _amount_words(t: str) -> str:
    words = []
    for w in t.split():
        if w in _HUNDRED_COMPOUNDS:
            words += [str(_HUNDRED_COMPOUNDS[w]), "hundred"]
        else:
            words.append(w)
    follow = set(_AMOUNT_UNITS) | set(lx.MONEY)
    t = _spell_before(" ".join(words), follow, numbers=_AMOUNT_NUMBER_WORDS)
    t = _spell_after(t, set(_AMOUNT_UNITS), _AMOUNT_NUMBER_WORDS)
    words = t.split()
    for i, w in enumerate(words):
        if w in _BARE_UNITS and not (i and _NUMERIC.match(words[i - 1])):
            words[i] = f"1 {w}"
    return " ".join(words)


def parse_amount(text: str) -> int | None:
    """A bare rupee amount, wherever said ("500 nahi 700" → 700). No minimum floor."""
    t = _amount_words(_depunct(normalise(text)))
    amounts = _amounts(
        t,
        assume_money=True,
        unit_rank=_AMOUNT_UNITS,
        unit_value=_AMOUNT_UNIT_VALUE,
        skip_units=_TIME_UNITS,
        merge_trailing=True,
    )
    if not amounts:
        return None
    return int(amounts[-1]["value"])


# parse_duration only: plural/romanised forms, day words that only count
# days ("दिवस", "நாள்"), extra "half" words and "dedh"/"dhai" as 1.5/2.5 —
# kept out of the shared lexicon sets so parse_income (which also reads
# lx.DAY/lx.WEEK/lx.NUMBER_WORDS) is unaffected.
_DURATION_DAY = {*lx.DAY, *_DURATION_COUNT_DAY}
_DURATION_WEEK = {*lx.WEEK, "weeks"}
_DURATION_HALF = {*lx.HALF, *(lx.nfc(w).lower() for w in ("আধা", "আধ", "అర"))}
_DURATION_NUMBER_WORDS = {**lx.NUMBER_WORDS, **_EXTRA_NUMBER_WORDS, "dedh": 1.5, "dhai": 2.5}
_DURATION_UNITS = set(lx.HOUR) | set(lx.MINUTE) | _DURATION_DAY | _DURATION_WEEK
_NUMBER_BEFORE = re.compile(r"(\d+(?:\.\d+)?)\s*$")
# "half an hour" / "half a day" → "half hour" / "half day".
_HALF_ARTICLE = re.compile(r"(?<![\w])(half)\s+(?:of\s+)?an?\s+")
# "one and a half hours" / "2 and half" → the number plus 0.5.
_AND_A_HALF = re.compile(r"(\S+)\s+(?:and|aur|और)\s+(?:a\s+)?half(?![\w])")
_HOUR_MINUTE_JOINER = re.compile(r"^[\s,]*(?:and|aur|और)?\s*$")


def _spans(t: str, words) -> list[tuple[int, int]]:
    return sorted({m.span() for w in words for m in re.finditer(_word(w), t)})


def _number_before(t: str, pos: int) -> tuple[float, int] | None:
    """The number ending right before `pos` (only whitespace in between) and
    where it starts, if any."""
    m = _NUMBER_BEFORE.search(t[:pos])
    return (float(m.group(1)), m.start(1)) if m else None


def _adjacent(a: tuple[int, int], b: tuple[int, int], t: str) -> bool:
    """True if spans `a` and `b` sit next to each other with only whitespace between."""
    if a[1] <= b[0]:
        return t[a[1] : b[0]].strip() == ""
    if b[1] <= a[0]:
        return t[b[1] : a[0]].strip() == ""
    return False


def _and_a_half(m: re.Match) -> str:
    word = m.group(1)
    value = _DURATION_NUMBER_WORDS.get(word)
    if value is None and _NUMERIC.match(word) and "," not in word:
        value = float(word)
    return f"{value + 0.5:g}" if value is not None else m.group(0)


def parse_duration(text: str, lang: str) -> int | None:
    """A spoken duration, in minutes. When several are said, the last one wins
    ("3 ghante nahi 2 ghante" → 120). `lang` is accepted for a uniform call
    signature across agents; the lexicon already covers every language."""
    t = _depunct(normalise(text))
    t = _HALF_ARTICLE.sub(r"\1 ", t)
    t = _AND_A_HALF.sub(_and_a_half, t)
    t = _spell_before(t, _DURATION_UNITS, numbers=_DURATION_NUMBER_WORDS)

    # (position, minutes) for every duration said; the latest one wins.
    found: list[tuple[int, float]] = [(s, 480) for s, _ in _spans(t, lx.FULL_DAY)]
    days, hours = _spans(t, _DURATION_DAY), _spans(t, lx.HOUR)
    for half in _spans(t, _DURATION_HALF):
        found += [(half[0], 240) for d in days if _adjacent(half, d, t)]
        found += [(half[0], 30) for h in hours if _adjacent(half, h, t)]

    hour_ends: dict[int, float] = {}  # "2 hours" ends at → its minutes
    for s, e in hours:
        n = _number_before(t, s)
        if n is not None:
            found.append((n[1], n[0] * 60))
            hour_ends[e] = n[0] * 60
    for s, _ in _spans(t, lx.MINUTE):
        n = _number_before(t, s)
        if n is None:
            continue
        # "1 hour 30 minutes" is one duration, not two.
        prev_end = max((end for end in hour_ends if end <= n[1]), default=None)
        if prev_end is not None and _HOUR_MINUTE_JOINER.match(t[prev_end : n[1]]):
            found.append((n[1], hour_ends[prev_end] + n[0]))
        else:
            found.append((n[1], n[0]))
    for s, _ in _spans(t, _DURATION_WEEK):
        n = _number_before(t, s)
        if n is not None:
            found.append((n[1], n[0] * 10_080))
    for s, _ in days:
        n = _number_before(t, s)
        if n is not None and n[0] == 1:
            found.append((n[1], 480))  # "one day" of work is a working day
        elif n is not None and n[0] >= 2:
            found.append((n[1], n[0] * 1_440))

    if not found:
        return None
    return round(max(found, key=lambda f: f[0])[1])


# "सही है ना?" = "right, isn't it?" — a yes, not a no.
_TAG_NA = re.compile(r"\s*(है|हैं|हो)\s+ना\s*[?।.!]*$")


def detect_yes_no(text: str, lang: str) -> str | None:
    """The last yes/no word wins ("no, yes" → yes). English words count in every language."""
    t = _TAG_NA.sub(" है", normalise(text))
    words = [(w, "yes") for w in lx.YES.get(lang, []) + lx.YES["en"]]
    words += [(w, "no") for w in lx.NO.get(lang, []) + lx.NO["en"]]
    best, pos = None, -1
    for w, kind in words:
        for m in re.finditer(_word(w), t):
            if m.start() > pos:
                best, pos = kind, m.start()
    return best


def detect_done(text: str, lang: str) -> bool:
    return _has(lx.DONE.get(lang, []) + lx.DONE["en"], normalise(text))


def detect_change(text: str, lang: str) -> bool:
    return _has(lx.CHANGE.get(lang, []) + lx.CHANGE["en"], normalise(text))


def clean_name(text: str) -> str | None:
    t = " ".join(lx.nfc(text).split()).strip(" .,!?।")
    for pattern in lx.NAME_FILLERS:
        t = re.sub(pattern, "", t, flags=re.IGNORECASE).strip(" .,!?।")
    if not t or not NAME_RE.match(t):
        return None
    words = t.split()
    if len(words) > 5 or any(w.lower() in lx.NAME_STOPWORDS for w in words):
        return None
    return " ".join(w[:1].upper() + w[1:] if w.isascii() else w for w in words)
