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
_UNIT_RANK = {
    **{u: 1 for u in lx.HUNDRED},
    **{u: 2 for u in lx.THOUSAND},
    **{u: 3 for u in lx.LAKH},
    **{u: 4 for u in lx.CRORE},
}
_UNIT_VALUE = {1: 100, 2: 1_000, 3: 100_000, 4: 10_000_000}


def _spell_before(t: str, follow: set[str]) -> str:
    """Replace a spelled number with digits when the very next word is in `follow`."""
    words = t.split()
    for i, w in enumerate(words[:-1]):
        if w in lx.NUMBER_WORDS and words[i + 1] in follow:
            words[i] = str(lx.NUMBER_WORDS[w])
    return " ".join(words)


def _spell_numbers(t: str) -> str:
    """'पंद्रह हज़ार' → '15 हज़ार' (only right before hundred/thousand/lakh/crore words)."""
    return _spell_before(t, set(_UNIT_RANK))


def _amounts(t: str, assume_money: bool = False) -> list[dict]:
    money = assume_money or _has(lx.MONEY, t) or "₹" in t
    found = []
    for m in _AMOUNT.finditer(t):
        raw, unit = m.group(1), (m.group(2) or "")
        try:
            value = float(raw.replace(",", ""))
        except ValueError:
            continue
        rank = _UNIT_RANK.get(unit, 0)
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
                "value": value * _UNIT_VALUE.get(rank, 1),
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


def parse_amount(text: str) -> int | None:
    """A bare rupee amount, wherever said ("500 nahi 700" → 700). No minimum floor."""
    t = _spell_numbers(normalise(text))
    amounts = _amounts(t, assume_money=True)
    if not amounts:
        return None
    return int(amounts[-1]["value"])


_DURATION_UNITS = set(lx.HOUR) | set(lx.MINUTE) | set(lx.DAY) | set(lx.WEEK)
_NUMBER_BEFORE = re.compile(r"(\d+(?:\.\d+)?)\s*$")


def _find_unit(t: str, words) -> tuple[int, int] | None:
    """The earliest match of any of `words` in `t`, or None."""
    hits = [m.span() for w in words for m in re.finditer(_word(w), t)]
    return min(hits, default=None)


def _number_before(t: str, pos: int) -> float | None:
    """The number ending right before `pos` (only whitespace in between), if any."""
    m = _NUMBER_BEFORE.search(t[:pos])
    return float(m.group(1)) if m else None


def _adjacent(a: tuple[int, int], b: tuple[int, int], t: str) -> bool:
    """True if spans `a` and `b` sit next to each other with only whitespace between."""
    if a[1] <= b[0]:
        return t[a[1] : b[0]].strip() == ""
    if b[1] <= a[0]:
        return t[b[1] : a[0]].strip() == ""
    return False


def parse_duration(text: str, lang: str) -> int | None:
    """A spoken duration, in minutes. `lang` is accepted for a uniform call
    signature across agents; the lexicon already covers every language."""
    t = _spell_before(normalise(text), _DURATION_UNITS)

    if _has(lx.FULL_DAY, t):
        return 480

    half = _find_unit(t, lx.HALF)
    day = _find_unit(t, lx.DAY)
    hour = _find_unit(t, lx.HOUR)
    minute = _find_unit(t, lx.MINUTE)
    week = _find_unit(t, lx.WEEK)

    if half and day and _adjacent(half, day, t):
        return 240
    if half and hour and _adjacent(half, hour, t):
        return 30

    if hour and minute:
        n_h, n_m = _number_before(t, hour[0]), _number_before(t, minute[0])
        if n_h is not None and n_m is not None:
            return round(n_h * 60 + n_m)
    if hour:
        n = _number_before(t, hour[0])
        if n is not None:
            return round(n * 60)
    if minute:
        n = _number_before(t, minute[0])
        if n is not None:
            return round(n)
    if week:
        n = _number_before(t, week[0])
        if n is not None:
            return round(n * 10_080)
    if day:
        n = _number_before(t, day[0])
        if n == 1:
            return 480
        if n is not None and n >= 2:
            return round(n * 1_440)
    return None


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
