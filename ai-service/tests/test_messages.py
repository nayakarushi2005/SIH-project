from app.agents.onboarding.lexicon import LANGS, in_script
from app.agents.onboarding.messages import MESSAGES, msg


def test_every_language_has_every_key_in_its_script():
    keys = set(MESSAGES["en"])
    for lang in LANGS:
        assert set(MESSAGES[lang]) == keys, lang
        for key, text in MESSAGES[lang].items():
            if lang != "en":
                assert in_script(text, lang), (lang, key)


def test_placeholders_fill():
    assert "Ravi" in msg("hi", "confirm_name", name="Ravi")


def test_unknown_language_falls_back_to_english():
    assert msg("fr", "ask_income") == MESSAGES["en"]["ask_income"]
