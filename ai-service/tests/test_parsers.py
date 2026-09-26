import pytest

from app.agents.onboarding.parsers import clean_name, detect_done, detect_yes_no, parse_income


@pytest.mark.parametrize(
    "text,bracket",
    [
        ("2 lakh", "1l_2_5l"),
        ("around 3.5 lakh a year", "2_5l_5l"),
        ("15000 per month", "1l_2_5l"),          # 1.8 L/yr
        ("15 हज़ार महीना", "1l_2_5l"),
        ("साल का 80 हजार", "lt_1l"),
        ("১২ হাজার মাসে", "1l_2_5l"),             # Bengali digits, 1.44 L/yr
        ("மாதம் 25 ஆயிரம்", "2_5l_5l"),           # 3 L/yr
        ("నెలకు 50 వేల", "5l_10l"),               # 6 L/yr
        ("12 लाख", "gt_10l"),
        ("7,50,000", "5l_10l"),
        ("20000", "1l_2_5l"),                    # no period, small → monthly
        ("5 lakh", "5l_10l"),                    # boundary: 5 L goes to 5–10
        ("nothing", None),
    ],
)
def test_parse_income(text, bracket):
    assert parse_income(text).bracket == bracket


def test_parse_income_uses_the_last_amount_for_corrections():
    assert parse_income("2 lakh, no wait, 6 lakh").bracket == "5l_10l"


@pytest.mark.parametrize(
    "text,lang,expected",
    [
        ("yes", "en", "yes"), ("haan ji", "hi", "yes"), ("हाँ सही है", "hi", "yes"),
        ("नहीं", "hi", "no"), ("होय", "mr", "yes"), ("नाही", "mr", "no"),
        ("হ্যাঁ", "bn", "yes"), ("না", "bn", "no"), ("ஆமாம்", "ta", "yes"),
        ("இல்லை", "ta", "no"), ("అవును", "te", "yes"), ("కాదు", "te", "no"),
        ("maybe tomorrow", "en", None), ("no, yes", "en", "yes"),
    ],
)
def test_detect_yes_no(text, lang, expected):
    assert detect_yes_no(text, lang) == expected


@pytest.mark.parametrize("text,lang", [("that's all", "en"), ("बस", "hi"), ("போதும்", "ta"), ("అంతే", "te")])
def test_detect_done(text, lang):
    assert detect_done(text, lang)


@pytest.mark.parametrize(
    "text,name",
    [
        ("my name is Ramesh Kumar", "Ramesh Kumar"),
        ("मेरा नाम सुनीता देवी है", "सुनीता देवी"),
        ("Asha", "Asha"),
        ("123", None),
        ("", None),
    ],
)
def test_clean_name(text, name):
    assert clean_name(text) == name
