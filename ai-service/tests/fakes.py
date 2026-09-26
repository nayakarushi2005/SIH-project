"""Test doubles: Node category payloads built from the real taxonomy, and a
scripted extractor so conversation tests never call an LLM."""

import json
from pathlib import Path

DATA = json.loads(
    (Path(__file__).resolve().parents[2] / "backend" / "data" / "categories.json").read_text("utf-8")
)


def node_payload(lang: str) -> dict:
    """Same shape as GET /api/categories?lang=..&withSynonyms=1."""
    groups = []
    for g in DATA["groups"]:
        cats = [
            {
                "slug": c["slug"],
                "name": c["names"][lang],
                "icon": c["icon"],
                "ncoCode": c["ncoCode"],
                "synonyms": c["synonyms"][lang],
            }
            for c in DATA["categories"]
            if c["group"] == g["slug"]
        ]
        groups.append({"slug": g["slug"], "name": g["names"][lang], "icon": g["icon"], "categories": cats})
    return {"lang": lang, "groups": groups}


LANG_PAYLOAD = node_payload("hi")
EN_PAYLOAD = node_payload("en")


class FakeExtractor:
    """Returns queued results in order (None when empty); records calls."""

    def __init__(self, results=None):
        self.results = list(results or [])
        self.calls = []

    async def extract(self, schema, *, lang, question, transcript, context=""):
        self.calls.append((schema.__name__, transcript))
        return self.results.pop(0) if self.results else None
