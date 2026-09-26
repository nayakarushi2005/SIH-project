"""Words the onboarding agent recognises without the LLM, per language.

All entries are NFC-normalised at import, the same way parsers normalise
what the user said, so "हज़ार" matches whether the nukta was typed as one
character or two.
"""

import re
import unicodedata

LANGS = ("en", "hi", "mr", "bn", "ta", "te")

_SCRIPT_RANGES = {
    "hi": r"[ऀ-ॿ]",
    "mr": r"[ऀ-ॿ]",
    "bn": r"[ঀ-৿]",
    "ta": r"[஀-௿]",
    "te": r"[ఀ-౿]",
}
SCRIPT = {lang: re.compile(rx) for lang, rx in _SCRIPT_RANGES.items()}
INDIC = re.compile(r"[ऀ-෿]")


def in_script(text: str, lang: str) -> bool:
    """True if `text` is written in the script of `lang` (English: no Indic letters)."""
    if lang == "en":
        return not INDIC.search(text or "")
    rx = SCRIPT.get(lang)
    return bool(rx and rx.search(text or ""))


def nfc(text: str) -> str:
    return unicodedata.normalize("NFC", text or "")


# Native digits → ASCII (Devanagari, Bengali, Tamil, Telugu).
DIGITS = str.maketrans(
    "०१२३४५६७८९০১২৩৪৫৬৭৮৯௦௧௨௩௪௫௬௭௮௯౦౧౨౩౪౫౬౭౮౯",
    "0123456789" * 4,
)


def _norm(words):
    return [nfc(w).lower() for w in words]


def _norm_map(mapping):
    return {lang: _norm(words) for lang, words in mapping.items()}


YES = _norm_map(
    {
        "en": ["yes", "yeah", "yep", "correct", "right", "ok", "okay", "sure", "haan", "ha", "han"],
        "hi": ["हाँ", "हां", "हा", "जी", "सही", "ठीक", "बिल्कुल", "haan", "ha", "ji", "sahi"],
        "mr": ["हो", "होय", "हां", "बरोबर", "ठीक"],
        "bn": ["হ্যাঁ", "হাঁ", "হ্যা", "ঠিক", "আচ্ছা"],
        "ta": ["ஆம்", "ஆமாம்", "ஆமா", "சரி"],
        "te": ["అవును", "ఔను", "సరే", "అవునండి"],
    }
)

NO = _norm_map(
    {
        "en": ["no", "nope", "not", "wrong", "nahi", "na"],
        "hi": ["नहीं", "नही", "ना", "गलत", "nahi", "na"],
        "mr": ["नाही", "नको", "चूक"],
        "bn": ["না", "ভুল"],
        "ta": ["இல்லை", "வேண்டாம்", "தவறு"],
        "te": ["కాదు", "లేదు", "వద్దు", "తప్పు"],
    }
)

DONE = _norm_map(
    {
        "en": ["done", "that's all", "that is all", "finished", "nothing else", "only this"],
        "hi": ["बस", "हो गया", "और नहीं", "इतना ही"],
        "mr": ["बस", "झाले", "एवढेच"],
        "bn": ["ব্যস", "হয়ে গেছে", "আর না", "এটুকুই"],
        "ta": ["போதும்", "அவ்வளவுதான்", "முடிந்தது"],
        "te": ["చాలు", "అంతే", "అయిపోయింది"],
    }
)

LAKH = _norm(["lakh", "lac", "lakhs", "लाख", "লাখ", "লক্ষ", "லட்சம்", "லட்ச", "లక్ష", "లక్షలు"])
THOUSAND = _norm(
    ["thousand", "k", "hazar", "hajar", "हज़ार", "हजार", "হাজার", "ஆயிரம்", "వేల", "వేలు", "వెయ్యి"]
)
CRORE = _norm(["crore", "करोड़", "কোটি", "கோடி", "కోటి"])

MONTH = _norm(
    [
        "month", "monthly", "mahina", "mahine", "महीना", "महीने", "मासिक", "महिना",
        "महिन्याला", "মাস", "মাসে", "மாதம்", "மாத", "నెల", "నెలకు",
    ]
)
YEAR = _norm(
    [
        "year", "yearly", "annual", "saal", "sal", "साल", "वर्ष", "सालाना", "वर्षाला",
        "বছর", "বছরে", "வருடம்", "ஆண்டு", "సంవత్సరం", "ఏడాది",
    ]
)

# Stripped from the start/end of a spoken name ("my name is …", "मेरा नाम … है").
NAME_FILLERS = [
    r"^(my name is|my name's|i am|i'm|this is|it is|it's)\s+",
    r"^(मेरा नाम है|मेरा नाम|मैं)\s+",
    r"\s+(है|हूँ|हूं)$",
    r"^(माझे नाव|माझं नाव|मी)\s+",
    r"\s+(आहे)$",
    r"^(আমার নাম|আমি)\s+",
    r"^(என் பெயர்|நான்)\s+",
    r"^(నా పేరు|నేను)\s+",
]

# If any of these is left in a "name", it wasn't really a name — ask the LLM.
NAME_STOPWORDS = set(
    _norm(
        [
            "uh", "um", "umm", "hmm", "it's", "its", "is", "my", "name", "i", "am", "the",
            "a", "ok", "okay", "yes", "no", "haan", "nahi", "what", "why", "hello", "hi",
            "मेरा", "नाम", "है", "क्या", "हाँ", "नहीं", "माझे", "नाव", "আমার", "নাম",
            "என்", "பெயர்", "నా", "పేరు",
        ]
    )
)
