import pytest

from app.agents.common.parsers import IncomeResult, parse_amount, parse_duration, parse_income


@pytest.mark.parametrize(
    "text,expected",
    [
        ("पाँच सौ रुपये", 500),
        ("2000", 2000),
        ("₹1,500", 1500),
        ("2 hazaar", 2000),
        ("500 nahi 700", 700),
        ("दो हज़ार", 2000),
        ("9876543210", None),
        ("", None),
        # tens after a hundred / thousand are kept
        ("दो सौ पचास", 250),
        ("तीन सौ पचास", 350),
        ("2 hazaar 500", 2500),
        ("दो हज़ार पाँच सौ", 2500),
        ("पाचशे पन्नास", 550),
        # a number right before a time unit is a duration, not the price
        ("500 for 2 hours", 500),
        ("₹500, 2 ghante", 500),
        ("2 घंटे", None),
        # a bare hundred/thousand word is one of it
        ("सौ रुपये", 100),
        ("a hundred rupees", 100),
        ("fifty rupees", 50),
        # "दो" after an amount is "give", not 2
        ("पाँच सौ दो", 500),
    ],
)
def test_parse_amount(text, expected):
    assert parse_amount(text) == expected


@pytest.mark.parametrize(
    "text,lang,expected",
    [
        ("2 ghante", "en", 120),
        ("दो घंटे", "hi", 120),
        ("आधा दिन", "hi", 240),
        ("पूरा दिन", "hi", 480),
        ("3 days", "en", 4320),
        ("45 minutes", "en", 45),
        ("1 hour 30 minutes", "en", 90),
        ("डेढ़ घंटे", "hi", 90),
        ("अर्धा तास", "mr", 30),
        ("৩ ঘণ্টা", "bn", 180),
        ("2 மணி நேரம்", "ta", 120),
        ("రెండు గంటలు", "te", 120),
        ("2", "en", None),
        ("kal", "hi", None),
        # "and a half", and the last duration said wins
        ("one and a half hours", "en", 90),
        ("2 and a half hours", "en", 150),
        ("3 ghante nahi 2 ghante", "hi", 120),
        ("2 hours, no, 1 day", "en", 480),
        ("1 hour and 30 minutes", "en", 90),
        # "one" forms, day-count words and half forms
        ("half an hour", "en", 30),
        ("an hour", "en", 60),
        ("ek ghanta", "hi", 60),
        ("2 din", "hi", 2880),
        ("do din", "hi", 2880),
        ("एक दिवस", "mr", 480),
        ("दोन दिवस", "mr", 2880),
        ("এক দিন", "bn", 480),
        ("২ দিন", "bn", 2880),
        ("আধ ঘণ্টা", "bn", 30),
        ("আধা ঘণ্টা", "bn", 30),
        ("ஒரு நாள்", "ta", 480),
        ("2 நாட்கள்", "ta", 2880),
        ("2 రోజులు", "te", 2880),
        ("అర గంట", "te", 30),
    ],
)
def test_parse_duration(text, lang, expected):
    assert parse_duration(text, lang) == expected


# ── Regression: the amount/duration-only vocabulary (HUNDRED, "hazaar",
# "dedh"/"dhai") must not leak into parse_income, which reads the same
# shared lexicon sets. Expected values are the base-commit (d7bf354)
# behaviour: none of these phrases were understood by parse_income before.
@pytest.mark.parametrize(
    "text",
    [
        "पाँच सौ रुपये",
        "पाँच सौ रुपये रोज",
        "2 hazaar",
        "dedh lakh",
        # the parse_amount/parse_duration-only tables added later
        "पाचशे रुपये",
        "পাঁচশো টাকা",
        "ஐநூறு ரூபாய்",
        "ఐదు వందల రూపాయలు",
        "दो सौ पचास",
        "ek lakh",
        "ஒரு லட்சம்",
    ],
)
def test_parse_income_unaffected_by_amount_duration_vocabulary(text):
    assert parse_income(text) == IncomeResult(None)


# Base-commit parse_income results for phrases the amount-only rules
# (trailing merge, time-unit skip) would read differently.
@pytest.mark.parametrize(
    "text,expected",
    [
        ("2 hazaar 500", IncomeResult("lt_1l", 500, "month")),
        ("20 हज़ार 500", IncomeResult("lt_1l", 500, "month")),
        ("₹15000, 2 ghante", IncomeResult("1l_2_5l", 15000, "month")),
        ("2 लाख 50 हज़ार साल", IncomeResult("2_5l_5l", 250_000, "year")),
    ],
)
def test_parse_income_keeps_its_own_amount_rules(text, expected):
    assert parse_income(text) == expected


# Every example the assistant speaks ("for example: …") must parse to what it says.
_EXAMPLES = {
    "en": {
        "ask_price_retry": [("five hundred rupees", 500)],
        "ask_duration": [("two hours", 120), ("half a day", 240)],
        "ask_duration_retry": [("one hour", 60), ("a full day", 480)],
    },
    "hi": {
        "ask_price_retry": [("पाँच सौ रुपये", 500)],
        "ask_duration": [("दो घंटे", 120), ("आधा दिन", 240)],
        "ask_duration_retry": [("एक घंटा", 60), ("पूरा दिन", 480)],
    },
    "mr": {
        "ask_price_retry": [("पाचशे रुपये", 500)],
        "ask_duration": [("दोन तास", 120), ("अर्धा दिवस", 240)],
        "ask_duration_retry": [("एक तास", 60), ("पूर्ण दिवस", 480)],
    },
    "bn": {
        "ask_price_retry": [("পাঁচশো টাকা", 500)],
        "ask_duration": [("দুই ঘণ্টা", 120), ("আধা দিন", 240)],
        "ask_duration_retry": [("এক ঘণ্টা", 60), ("সারা দিন", 480)],
    },
    "ta": {
        "ask_price_retry": [("ஐநூறு ரூபாய்", 500)],
        "ask_duration": [("இரண்டு மணி நேரம்", 120), ("அரை நாள்", 240)],
        "ask_duration_retry": [("ஒரு மணி நேரம்", 60), ("முழு நாள்", 480)],
    },
    "te": {
        "ask_price_retry": [("ఐదు వందల రూపాయలు", 500)],
        "ask_duration": [("రెండు గంటలు", 120), ("సగం రోజు", 240)],
        "ask_duration_retry": [("ఒక గంట", 60), ("పూర్తి రోజు", 480)],
    },
}


@pytest.mark.parametrize(
    "lang,key,phrase,expected",
    [
        (lang, key, phrase, expected)
        for lang, keys in _EXAMPLES.items()
        for key, pairs in keys.items()
        for phrase, expected in pairs
    ],
)
def test_every_spoken_example_parses(lang, key, phrase, expected):
    from app.agents.job_posting.messages import MESSAGES

    assert phrase in MESSAGES[lang][key]  # the table tracks the templates
    if key == "ask_price_retry":
        assert parse_amount(phrase) == expected
        # also as the user would say it, in a sentence with punctuation
        assert parse_amount(f"{phrase}।") == expected
    else:
        assert parse_duration(phrase, lang) == expected
        assert parse_duration(f"{phrase}.", lang) == expected


def test_example_table_covers_every_language_and_example_key():
    from app.agents.common.lexicon import LANGS
    from app.agents.job_posting.messages import MESSAGES

    assert set(_EXAMPLES) == set(LANGS)
    # ask_category's examples are service names (matched by the catalog, not a parser)
    example_keys = {
        k
        for k, v in MESSAGES["en"].items()
        if k.startswith("ask_") and "example" in v and k != "ask_category"
    }
    assert example_keys == {"ask_price_retry", "ask_duration", "ask_duration_retry"}
    for lang in LANGS:
        assert set(_EXAMPLES[lang]) == example_keys
