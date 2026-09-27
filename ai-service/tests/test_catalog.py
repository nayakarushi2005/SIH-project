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


async def test_cache_serves_the_last_catalog_when_node_is_down():
    import pytest as _pytest

    from app.agents.onboarding.catalog import CatalogCache
    from app.errors import ServiceError

    class Node:
        down = False

        async def get_categories(self, lang):
            if self.down:
                raise ServiceError(503, "down", "backend_unavailable")
            return EN_PAYLOAD if lang == "en" else LANG_PAYLOAD

    node = Node()
    cache = CatalogCache(node, ttl=0)  # every call is "stale"
    first = await cache.get("hi")
    node.down = True
    assert await cache.get("hi") is first
    with _pytest.raises(ServiceError):
        await cache.get("ta")  # never fetched → nothing to fall back to


def test_federation_spoken_in_indian_script_matches_an_english_name():
    opts = [{"id": "f1", "name": "Pune Gig Workers Union"}, {"id": "f2", "name": "Shramik Sangh"}]
    assert match_federation(opts, "श्रमिक संघ", "hi") == "f2"
    assert match_federation(opts, "শ্রমিক সংঘ", "bn") == "f2"
    assert match_federation(opts, "శ్రామిక్ సంఘ్", "te") == "f2"
    assert match_federation(opts, "पुणे गिग वर्कर्स यूनियन", "hi") == "f1"
    assert match_federation(opts, "कुछ नहीं", "hi") is None


def test_common_words_that_are_also_synonyms_do_not_match():
    for text in ["मैं काम के लिए आया हूं", "nai pata", "ro mat", "I work on the road side selling tea",
                 "আরো যোগ করুন", "আমি জেলে ছিলাম", "మా నేత చెప్పారు"]:
        assert match_categories(cat, text) == [], text


def test_negated_work_is_not_selected():
    assert match_categories(cat, "मैं प्लंबर नहीं हूं") == []
    assert match_categories(cat, "I don't do AC repair") == []
    assert match_categories(cat, "मैं प्लंबर हूं, पेंटर नहीं") == ["plumber"]


def test_plain_work_words():
    assert match_categories(cat, "plumbing aur painting") == ["plumber", "painter"]


def test_no_before_a_federation_name_is_not_a_match():
    opts = [{"id": "f1", "name": "Pune Workers Union"}, {"id": "f2", "name": "Shramik Sangh"}]
    assert match_federation(opts, "no union") is None
    assert match_federation(opts, "not the workers union") is None
