"""Tidying spoken job descriptions: the raw transcript fallback and LLM drafts."""

import re
import unicodedata

from app.agents.common.lexicon import in_script, nfc
from app.agents.job_posting.state import DESC_MAX, DESC_MIN

_FILLERS = (
    "um",
    "uh",
    "umm",
    "hmm",
    "toh",
    "matlab",
    "मतलब",
    "तो",
    "याने",
    "म्हणजे",
    "মানে",
    "அதாவது",
    "అంటే",
)
_PUNCT = " \t,.;:!?।…-–—"
_LEADING_FILLER = re.compile(
    r"^(?:(?:" + "|".join(re.escape(nfc(w)) for w in _FILLERS) + r")(?![\wऀ-෿])"
    rf"[{re.escape(_PUNCT)}]*)+",
    re.IGNORECASE,
)
_SENTENCE_END = ".।?!"


def _collapse(text: str) -> str:
    return " ".join(text.split())


def _cut(text: str, max_len: int) -> str:
    """`text` cut to `max_len` at the last sentence end, else the last space."""
    if len(text) <= max_len:
        return text
    window = text[:max_len]
    end = max(window.rfind(c) for c in _SENTENCE_END)
    if end > 0:
        return window[: end + 1].strip()
    space = window.rfind(" ")
    return (window[:space] if space > 0 else window).strip()


def clean_dictation(text: str, max_len: int = DESC_MAX) -> str:
    t = _collapse(nfc(text)).lstrip(_PUNCT)
    t = _LEADING_FILLER.sub("", t).lstrip(_PUNCT).rstrip()
    if t and t[0].isascii() and t[0].isalpha():
        t = t[0].upper() + t[1:]
    return _cut(t, max_len)


def sanitize_draft(text: str, lang: str, max_len: int = DESC_MAX) -> str | None:
    """An LLM draft fit to show and speak, or None if it is too short or in the wrong script."""
    t = "".join(" " if unicodedata.category(c) == "Cc" else c for c in nfc(text or ""))
    t = _cut(_collapse(t), max_len)
    if len(t) < DESC_MIN or not in_script(t, lang):
        return None
    return t
