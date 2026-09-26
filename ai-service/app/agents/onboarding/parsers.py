"""Rule-based understanding. Runs before (and often instead of) the LLM."""

import re
from dataclasses import dataclass

from app.agents.onboarding import lexicon as lx

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
    return rf"(?<!\w){re.escape(w)}(?![\wऀ-෿])"


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


def parse_income(text: str) -> IncomeResult:
    t = normalise(text)
    amounts = []
    for m in _AMOUNT.finditer(t):
        raw, unit = m.group(1), (m.group(2) or "")
        try:
            value = float(raw.replace(",", ""))
        except ValueError:
            continue
        if unit in lx.LAKH:
            value *= 100_000
        elif unit in lx.THOUSAND:
            value *= 1_000
        elif unit in lx.CRORE:
            value *= 10_000_000
        amounts.append(int(value))
    amounts = [a for a in amounts if a >= 500]  # ignore stray small numbers
    if not amounts:
        return IncomeResult(None)
    amount = amounts[-1]  # "2 lakh, no, 6 lakh" → the correction wins
    if _has(lx.MONTH, t):
        period = "month"
    elif _has(lx.YEAR, t):
        period = "year"
    else:
        # People quote monthly pay; big round numbers are usually yearly.
        period = "month" if amount <= 50_000 else "year"
    yearly = amount * 12 if period == "month" else amount
    return IncomeResult(bracket_for(yearly), amount, period)


def detect_yes_no(text: str, lang: str) -> str | None:
    """The last yes/no word wins ("no, yes" → yes). English words count in every language."""
    t = normalise(text)
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
