from app.agents.onboarding.catalog import Catalog, match_categories, match_federation
from tests.fakes import EN_PAYLOAD, LANG_PAYLOAD

cat = Catalog.from_node(LANG_PAYLOAD, EN_PAYLOAD)


def test_matches_native_names_synonyms_and_english_in_order():
    assert match_categories(cat, "मैं बिजली वाला हूँ और कभी कभी cook का काम") == ["electrician", "cook"]


def test_matches_romanised_synonym():
    assert match_categories(cat, "bijli wala") == ["electrician"]


def test_fuzzy_match_tolerates_small_stt_errors():
    assert match_categories(cat, "plumbar") == ["plumber"]


def test_no_false_positive_on_short_common_words():
    assert match_categories(cat, "haan ji theek hai") == []


def test_localised_name():
    assert cat.name("electrician") == "इलेक्ट्रीशियन"


def test_federation_match_by_name_or_none():
    opts = [{"id": "f1", "name": "Pune Gig Workers Union"}, {"id": "f2", "name": "Shramik Sangh"}]
    assert match_federation(opts, "shramik sangh wala") == "f2"
    assert match_federation(opts, "pune gig") == "f1"
    assert match_federation(opts, "kuch nahi") is None


def test_longer_phrase_wins_over_the_word_inside_it():
    assert match_categories(cat, "bus driver") == ["bus_driver"]


def test_english_inside_a_hindi_sentence():
    assert match_categories(cat, "मैं electrician हूँ") == ["electrician"]
