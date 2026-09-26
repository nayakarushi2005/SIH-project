import pytest

from app.agents.common.parsers import parse_amount, parse_duration


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
    ],
)
def test_parse_duration(text, lang, expected):
    assert parse_duration(text, lang) == expected
