"""What the job posting conversation remembers between turns."""

from typing import TypedDict

from app.agents.common.state import pick_lang

KIND = "job_posting"

PRICE_MIN = 50
PRICE_MAX = 100_000
DURATION_MIN = 15  # minutes
DURATION_MAX = 10_080  # seven days
DESC_MIN = 10
DESC_MAX = 500
ADDRESS_MIN = 5
ADDRESS_MAX = 300
DURATION_PRESETS = (30, 60, 120, 240, 480, 2880)

BUTTONS_AFTER = 3  # failed tries on a step before tap/typed choices are offered
HANDOFF_AFTER = 6  # failed tries on a step before we switch to the form
DESCRIPTION_HANDOFF_AFTER = 4  # description has no tap choices: switch to the form sooner

FIELDS = ("category", "description", "price", "duration", "address")


class JobPostingState(TypedDict, total=False):
    # Session
    kind: str
    owner: str
    created_at: float
    lang: str
    # Collected answers
    category: str | None
    description: str | None  # committed once the client says yes to the draft
    description_draft: str | None
    description_source: str | None  # "llm" | "transcript" | None
    price: int | None
    duration_mins: int | None
    address: str | None
    address_decided: bool
    # Flow
    # start|category|description|description_confirm|price|duration|address|
    # confirm|change|done|handoff
    step: str
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


def initial_state(
    user: dict, now: float, lang: str | None = None, category: str | None = None
) -> JobPostingState:
    # The language the app is showing wins over the profile (see onboarding).
    return {
        "kind": KIND,
        "owner": str(user["id"]),
        "created_at": now,
        "lang": pick_lang(lang, user.get("preferredLanguage")),
        "category": category or None,
        "description": None,
        "description_draft": None,
        "description_source": None,
        "price": None,
        "duration_mins": None,
        "address": None,
        "address_decided": False,
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


def filled(state: JobPostingState) -> dict:
    """What the app puts into the job form (and submits after adding a photo)."""
    return {
        "category": state.get("category"),
        "description": state.get("description"),
        "price": state.get("price"),
        "expectedDurationMins": state.get("duration_mins"),
        "address": state.get("address"),
        "language": state.get("lang"),
    }
