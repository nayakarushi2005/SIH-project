"""Small pieces of conversation state shared across agents."""

from app.agents.common.lexicon import LANGS


def pick_lang(*candidates: str | None) -> str:
    """The first supported language code among `candidates`, else English."""
    return next((c for c in candidates if c in LANGS), "en")
