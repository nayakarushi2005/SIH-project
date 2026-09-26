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
        "hi": ["हाँ", "हां", "हा", "सही", "ठीक", "बिल्कुल", "haan", "ha", "sahi"],
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
        "month",
        "monthly",
        "mahina",
        "mahine",
        "महीना",
        "महीने",
        "मासिक",
        "महिना",
        "माह",
        "मंथली",
        "महिन्याला",
        "মাস",
        "মাসে",
        "மாதம்",
        "மாத",
        "నెల",
        "నెలకు",
    ]
)
YEAR = _norm(
    [
        "year",
        "yearly",
        "annual",
        "saal",
        "sal",
        "साल",
        "वर्ष",
        "सालाना",
        "वर्षाला",
        "বছর",
        "বছরে",
        "வருடம்",
        "ஆண்டு",
        "సంవత్సరం",
        "ఏడాది",
    ]
)

DAY = _norm(
    [
        "day",
        "daily",
        "roz",
        "rozana",
        "रोज़",
        "रोज",
        "रोज़ाना",
        "रोजाना",
        "दिन",
        "दिहाड़ी",
        "दिहाडी",
        "दररोज",
        "रोजचे",
        "রোজ",
        "দিনে",
        "প্রতিদিন",
        "தினம்",
        "நாளுக்கு",
        "ஒரு நாளைக்கு",
        "రోజుకు",
        "రోజు",
    ]
)
WEEK = _norm(
    [
        "week",
        "weekly",
        "hafta",
        "hafte",
        "हफ्ता",
        "हफ्ते",
        "हफ़्ते",
        "हफ़्ता",
        "सप्ताह",
        "आठवडा",
        "आठवड्याला",
        "সপ্তাহে",
        "সপ্তাহ",
        "வாரம்",
        "வாரத்துக்கு",
        "వారానికి",
        "వారం",
    ]
)
# Money context: a bare 6-digit number is a PIN code unless one of these is said.
MONEY = _norm(
    [
        "₹",
        "rs",
        "rupees",
        "rupee",
        "inr",
        "salary",
        "income",
        "रुपये",
        "रुपए",
        "रुपया",
        "कमाई",
        "आमदनी",
        "पगार",
        "उत्पन्न",
        "টাকা",
        "আয়",
        "ரூபாய்",
        "சம்பளம்",
        "రూపాయలు",
        "జీతం",
    ]
)
# Spoken numbers before lakh/thousand ("पंद्रह हज़ार", "ढाई लाख", "twenty thousand").
NUMBER_WORDS = {
    **{
        w: v
        for w, v in zip(
            [
                "one",
                "two",
                "three",
                "four",
                "five",
                "six",
                "seven",
                "eight",
                "nine",
                "ten",
                "eleven",
                "twelve",
                "fifteen",
                "twenty",
                "twenty-five",
                "thirty",
                "forty",
                "fifty",
                "sixty",
                "seventy",
                "eighty",
                "ninety",
                "hundred",
            ],
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100],
            strict=True,
        )
    },
    "एक": 1,
    "दो": 2,
    "तीन": 3,
    "चार": 4,
    "पाँच": 5,
    "पांच": 5,
    "छह": 6,
    "छः": 6,
    "सात": 7,
    "आठ": 8,
    "नौ": 9,
    "दस": 10,
    "ग्यारह": 11,
    "बारह": 12,
    "पंद्रह": 15,
    "बीस": 20,
    "पच्चीस": 25,
    "तीस": 30,
    "चालीस": 40,
    "पचास": 50,
    "साठ": 60,
    "सत्तर": 70,
    "अस्सी": 80,
    "नब्बे": 90,
    "डेढ़": 1.5,
    "ढाई": 2.5,
    "दोन": 2,
    "पाच": 5,
    "दहा": 10,
    "पंधरा": 15,
    "वीस": 20,
    "पन्नास": 50,
    "दीड": 1.5,
    "अडीच": 2.5,
    "এক": 1,
    "দুই": 2,
    "তিন": 3,
    "চার": 4,
    "পাঁচ": 5,
    "দশ": 10,
    "পনেরো": 15,
    "বিশ": 20,
    "পঞ্চাশ": 50,
    "দেড়": 1.5,
    "আড়াই": 2.5,
    "ஒன்று": 1,
    "இரண்டு": 2,
    "மூன்று": 3,
    "நான்கு": 4,
    "ஐந்து": 5,
    "பத்து": 10,
    "பதினைந்து": 15,
    "இருபது": 20,
    "ஐம்பது": 50,
    "ఒకటి": 1,
    "రెండు": 2,
    "మూడు": 3,
    "నాలుగు": 4,
    "ఐదు": 5,
    "పది": 10,
    "పదిహేను": 15,
    "ఇరవై": 20,
    "యాభై": 50,
}
NUMBER_WORDS = {nfc(k).lower(): v for k, v in NUMBER_WORDS.items()}

# "not" words that cancel a job named just before them ("मैं प्लंबर नहीं हूं").
NEGATION_AFTER = _norm(
    ["not", "nahi", "नहीं", "नही", "नाही", "না", "নয়", "இல்லை", "கிடையாது", "కాదు", "లేదు"]
)
NEGATION_BEFORE = _norm(["don't", "dont", "do not", "not", "never", "no"])

# Synonyms that are also everyday words ("आया" = came, "nai" ~ nahi, "যোগ" =
# add, "জেলে" = in jail, "నేత" = leader): never matched on their own.
AMBIGUOUS_SYNONYMS = set(_norm(["आया", "nai", "ro", "road", "যোগ", "জেলে", "నేత", "बस"]))

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
            "uh",
            "um",
            "umm",
            "hmm",
            "it's",
            "its",
            "is",
            "my",
            "name",
            "i",
            "am",
            "the",
            "a",
            "ok",
            "okay",
            "yes",
            "no",
            "haan",
            "nahi",
            "what",
            "why",
            "hello",
            "hi",
            "मेरा",
            "नाम",
            "है",
            "क्या",
            "हाँ",
            "नहीं",
            "माझे",
            "नाव",
            "আমার",
            "নাম",
            "என்",
            "பெயர்",
            "నా",
            "పేరు",
            # greetings, questions and chit-chat that can look like a name
            "who",
            "are",
            "you",
            "how",
            "where",
            "when",
            "ignore",
            "previous",
            "instructions",
            "later",
            "weather",
            "today",
            "please",
            "thanks",
            "thank",
            "namaste",
            "नमस्ते",
            "नमस्कार",
            "आज",
            "मौसम",
            "अच्छा",
            "बाद",
            "में",
            "बताऊंगा",
            "बताऊँगा",
            "कौन",
            "आप",
            "कैसे",
            "धन्यवाद",
            "नंतर",
            "পরে",
            "நன்றி",
            "வணக்கம்",
            "తర్వాత",
            "నమస్కారం",
        ]
    )
)
