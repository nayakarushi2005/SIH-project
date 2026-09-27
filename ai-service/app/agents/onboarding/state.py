"""What the onboarding conversation remembers between turns."""

from typing import TypedDict

from app.agents.onboarding.lexicon import LANGS

MAX_CATEGORIES = 10
BUTTONS_AFTER = 3  # failed tries on a step before tap choices are offered
HANDOFF_AFTER = 6  # failed tries on a step before we switch to the form
NAME_HANDOFF_AFTER = 3  # names have no tap choices: switch to the form sooner

INCOME_BRACKETS = ("lt_1l", "1l_2_5l", "2_5l_5l", "5l_10l", "gt_10l")
FIELDS = ("name", "income", "categories", "federation")


class OnboardingState(TypedDict, total=False):
    # Session
    owner: str
    created_at: float
    lang: str
    # Collected answers
    verified_name: str | None  # from Aadhaar — never asked, never changed
    name: str | None
    income_bracket: str | None
    categories: list[str]
    federation_options: list[dict]  # [{id, name}] nearby, verified
    federation_id: str | None
    federation_decided: bool
    # Flow
    step: str  # start|name|name_confirm|income|categories|federation|confirm|change|done|handoff
    attempts: dict[str, int]
    return_to_confirm: bool
    # This turn
    turn: dict  # input: {kind: start|speech|tap, transcript?, selection?}
    outcome: dict  # understand → decide
    ack: list  # [(message key, kwargs)] said before the next question
    # Output
    speak: str
    ui: dict | None
    done: bool
    handoff: bool


def pick_lang(*candidates: str | None) -> str:
    """The first supported language code among `candidates`, else English."""
    return next((c for c in candidates if c in LANGS), "en")


def initial_state(
    user: dict, federation_options: list[dict], now: float, lang: str | None = None
) -> OnboardingState:
    # The language the app is showing wins over the profile: the phone reads
    # our text aloud in its own language, so the two must match.
    lang = pick_lang(lang, user.get("preferredLanguage"))
    verified_name = user.get("name") if user.get("isAadhaarVerified") and user.get("name") else None
    return {
        "owner": str(user["id"]),
        "created_at": now,
        "lang": lang,
        "verified_name": verified_name,
        "name": verified_name,
        "income_bracket": None,
        "categories": [],
        "federation_options": [{"id": f["id"], "name": f["name"]} for f in federation_options],
        "federation_id": None,
        "federation_decided": False,
        "step": "start",
        "attempts": {},
        "return_to_confirm": False,
        "outcome": {},
        "ack": [],
        "speak": "",
        "ui": None,
        "done": False,
        "handoff": False,
    }


def filled(state: OnboardingState) -> dict:
    """What the app submits to /api/worker/register (plus the federation request)."""
    return {
        "name": state.get("name"),
        "incomeBracket": state.get("income_bracket"),
        "categories": list(state.get("categories") or []),
        "federationId": state.get("federation_id"),
    }
