"""Job categories and federations, matched against what the worker said.

Each category is matched by its name and synonyms in the user's language
plus English (people mix languages: "मैं cook हूँ"). Exact phrase matches
win; a fuzzy pass only runs when nothing matched exactly, to absorb small
speech-to-text slips ("plumbar").
"""

import re
import time
from dataclasses import dataclass, field

from rapidfuzz import fuzz

from app.agents.onboarding.parsers import _word, normalise

FUZZY_MIN_SCORE = 84
FUZZY_MIN_LEN = 5
FUZZY_MAX_HITS = 2


def _variants(label: str) -> list[str]:
    """'Barber / hairdresser' → ['barber / hairdresser', 'barber', 'hairdresser']."""
    whole = normalise(label)
    parts = [p.strip() for p in re.split(r"[/&]", whole) if p.strip()]
    return [whole, *parts] if len(parts) > 1 else [whole]


@dataclass
class Category:
    slug: str
    name: str
    en_name: str
    words: list[str] = field(default_factory=list)


class Catalog:
    def __init__(self, categories: list[Category]):
        self.categories = categories
        self._by_slug = {c.slug: c for c in categories}

    @classmethod
    def from_node(cls, lang_payload: dict, en_payload: dict) -> "Catalog":
        en = {
            c["slug"]: c for g in en_payload.get("groups", []) for c in g.get("categories", [])
        }
        categories = []
        for group in lang_payload.get("groups", []):
            for c in group.get("categories", []):
                e = en.get(c["slug"], {})
                labels = [c["name"], *c.get("synonyms", [])]
                labels += [e.get("name", ""), *e.get("synonyms", [])]
                words = []
                for label in labels:
                    for v in _variants(label):
                        if len(v) >= 2 and v not in words:
                            words.append(v)
                categories.append(Category(c["slug"], c["name"], e.get("name", c["name"]), words))
        return cls(categories)

    @property
    def slugs(self) -> set[str]:
        return set(self._by_slug)

    def name(self, slug: str) -> str:
        c = self._by_slug.get(slug)
        return c.name if c else slug

    def candidates(self, text: str, limit: int = 25) -> list[dict]:
        """Most plausible categories for `text`, for the LLM to choose from."""
        t = normalise(text)
        scored = [
            (max((fuzz.token_set_ratio(w, t) for w in c.words), default=0), c)
            for c in self.categories
        ]
        scored.sort(key=lambda sc: -sc[0])
        return [{"slug": c.slug, "name": c.name, "en": c.en_name} for _, c in scored[:limit]]


def _drop_contained(hits: list[tuple[int, int, str]]) -> list[tuple[int, int, str]]:
    """Keep the longest phrase when one match sits inside another
    ("bus driver" should not also count as "driver")."""
    kept: list[tuple[int, int, str]] = []
    for start, end, slug in sorted(hits, key=lambda h: -(h[1] - h[0])):
        if any(s <= start and end <= e and slug != k for s, e, k in kept):
            continue
        kept.append((start, end, slug))
    return kept


def match_categories(catalog: Catalog, text: str) -> list[str]:
    t = normalise(text)
    if not t:
        return []
    hits = []
    for c in catalog.categories:
        for w in c.words:
            for m in re.finditer(_word(w), t):
                hits.append((m.start(), m.end(), c.slug))
    if not hits and len(t) >= 4:
        fuzzy = []
        for c in catalog.categories:
            best = None
            for w in c.words:
                if len(w) < FUZZY_MIN_LEN:
                    continue
                al = fuzz.partial_ratio_alignment(w, t)
                if al and al.score >= FUZZY_MIN_SCORE and (best is None or al.score > best[0]):
                    best = (al.score, al.dest_start, al.dest_end)
            if best:
                fuzzy.append((best[0], best[1], best[2], c.slug))
        fuzzy.sort(key=lambda f: -f[0])
        hits = [(s, e, slug) for _, s, e, slug in fuzzy[:FUZZY_MAX_HITS]]
    ordered = []
    for _, _, slug in sorted(_drop_contained(hits)):
        if slug not in ordered:
            ordered.append(slug)
    return ordered


def match_federation(options: list[dict], text: str) -> str | None:
    t = normalise(text)
    if not t:
        return None
    best_id, best_score = None, 0
    for opt in options:
        name = normalise(opt.get("name", ""))
        if not name:
            continue
        if name in t or (len(t) >= 4 and t in name):
            score = 100
        else:
            score = fuzz.token_set_ratio(name, t)
        if score > best_score:
            best_id, best_score = opt["id"], score
    return best_id if best_score >= 80 else None


class CatalogCache:
    """Category catalogue per language, fetched from Node and kept for `ttl` seconds."""

    def __init__(self, node, ttl: float = 600):
        self._node = node
        self._ttl = ttl
        self._cache: dict[str, tuple[float, Catalog]] = {}

    async def get(self, lang: str) -> Catalog:
        hit = self._cache.get(lang)
        if hit and time.monotonic() - hit[0] < self._ttl:
            return hit[1]
        lang_payload = await self._node.get_categories(lang)
        en_payload = lang_payload if lang == "en" else await self._node.get_categories("en")
        catalog = Catalog.from_node(lang_payload, en_payload)
        self._cache[lang] = (time.monotonic(), catalog)
        return catalog
