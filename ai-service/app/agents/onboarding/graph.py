"""The onboarding conversation as a LangGraph state machine.

One graph run per user turn:  START → understand → decide → ask → END.

- understand: read this turn's answer for the current step. Taps are taken
  as-is (after validation); speech goes through the rule-based parsers
  first and the LLM only if they can't tell.
- decide: accept the answer and move to the next step, or count a failed
  try (tap choices after 3, hand off to the form after 6).
- ask: say the next question from the fixed templates, in the user's
  language, and describe the tap choices to show.

The code, not the model, decides what is asked and in which order, so the
assistant can't be talked into skipping steps or wandering off.
"""

import logging
import re
import time
from collections.abc import Awaitable, Callable

from langgraph.graph import END, START, StateGraph

from app.agents.onboarding.catalog import Catalog, match_categories, match_federation
from app.agents.onboarding.extract import (
    CategoriesOut,
    Extractor,
    FederationOut,
    IncomeOut,
    NameOut,
    YesNoOut,
)
from app.agents.onboarding.lexicon import in_script
from app.agents.onboarding.messages import MESSAGES, msg
from app.agents.onboarding.parsers import (
    _has,
    bracket_for,
    clean_name,
    detect_done,
    detect_yes_no,
    normalise,
    parse_income,
)
from app.agents.onboarding.state import (
    BUTTONS_AFTER,
    FIELDS,
    HANDOFF_AFTER,
    INCOME_BRACKETS,
    MAX_CATEGORIES,
    NAME_HANDOFF_AFTER,
    OnboardingState,
)

log = logging.getLogger(__name__)

CatalogFor = Callable[[str], Awaitable[Catalog]]

# Words for each editable field, in every language (plus English).
_FIELD_KEYS = {
    "name": "field_name",
    "income": "field_income",
    "categories": "field_categories",
    "federation": "field_federation",
}


def _field_words(lang: str, field: str) -> list[str]:
    key = _FIELD_KEYS[field]
    words = {normalise(MESSAGES["en"][key]), normalise(MESSAGES.get(lang, {}).get(key, ""))}
    if field == "income":
        words |= {"salary", "earning", "kamai", "aamdani"}
    if field == "categories":
        words |= {"kaam", "job", "category", "categories"}
    return [w for w in words if w]


def _detect_field(text: str, lang: str) -> str | None:
    t = normalise(text)
    for field in FIELDS:
        if _has(_field_words(lang, field), t):
            return field
    return None


_LEADING_NO = re.compile(
    r"^\s*(?:no|nope|not|nahi|नहीं|नही|ना|नाही|नको|না|இல்லை|కాదు|లేదు)[\s,.।!]*", re.IGNORECASE
)


def _fail(reason: str, redirect: str | None = None, path: str = "rules") -> dict:
    return {"ok": False, "reason": reason, "redirect": redirect, "path": path}


def _from_llm(out) -> dict | None:
    """A failed/declined LLM reading as a failure outcome, or None if it answered."""
    if out is None:
        return _fail("unclear", path="llm")
    if out.intent != "answer":
        reason = "off_topic" if out.intent == "off_topic" else "unclear"
        return _fail(reason, out.redirect, "llm")
    return None


def _question_for(state: OnboardingState) -> str:
    """The question currently on screen, in English, for the LLM prompt."""
    return {
        "name": "What is your full name?",
        "name_confirm": f"Is your name {state.get('name')}? (yes/no)",
        "income": "What is your yearly or monthly income?",
        "categories": "What kinds of work do you do?",
        "federation": "Do you want to join one of these federations, or not?",
        "confirm": "Shall I save these details? (yes/no, or what to change)",
        "change": "What do you want to change: name, income, work or federation?",
    }.get(state.get("step", ""), "")


def build_graph(extractor: Extractor, catalog_for: CatalogFor, checkpointer):
    async def llm(schema, state, transcript, context=""):
        return await extractor.extract(
            schema,
            lang=state["lang"],
            question=_question_for(state),
            transcript=transcript,
            context=context,
        )

    # ── understand ──────────────────────────────────────────────────────────

    async def understand(state: OnboardingState) -> dict:
        turn = state.get("turn") or {}
        kind = turn.get("kind")
        if kind == "start":
            return {"outcome": {"ok": True, "reason": "start", "path": "start"}}
        step = state.get("step")
        lang = state["lang"]
        started = time.monotonic()

        if kind == "tap":
            outcome = await _understand_tap(state, turn.get("selection") or {})
        else:
            text = (turn.get("transcript") or "").strip()
            if not text:
                outcome = _fail("not_heard")
            else:
                handler = SPEECH.get(step)
                outcome = await handler(state, text) if handler else _fail("invalid")
        log.info(
            "turn step=%s reason=%s path=%s ms=%d lang=%s",
            step,
            outcome.get("reason"),
            outcome.get("path"),
            (time.monotonic() - started) * 1000,
            lang,
        )
        return {"outcome": outcome}

    async def _understand_tap(state, sel) -> dict:
        step = state.get("step")
        if step in ("name_confirm", "confirm") and isinstance(sel.get("yes"), bool):
            return {"ok": True, "reason": "answer", "yes": sel["yes"], "path": "tap"}
        if step in ("confirm", "change") and sel.get("field") in FIELDS:
            return {
                "ok": True,
                "reason": "answer",
                "yes": False,
                "field": sel["field"],
                "path": "tap",
            }
        if step == "income" and sel.get("incomeBracket") in INCOME_BRACKETS:
            return {"ok": True, "reason": "answer", "bracket": sel["incomeBracket"], "path": "tap"}
        if step == "categories" and isinstance(sel.get("categories"), list):
            catalog = await catalog_for(state["lang"])
            slugs = [s for s in dict.fromkeys(sel["categories"]) if s in catalog.slugs]
            slugs = slugs[:MAX_CATEGORIES]
            confirm = bool(sel.get("confirm"))
            if confirm and not slugs:
                return _fail("invalid", path="tap")
            return {
                "ok": True,
                "reason": "answer",
                "set": slugs,
                "confirmed": confirm,
                "path": "tap",
            }
        if step == "federation" and "federationId" in sel:
            fid = sel["federationId"]
            if fid is None:
                return {"ok": True, "reason": "answer", "declined": True, "path": "tap"}
            if any(o["id"] == fid for o in state.get("federation_options", [])):
                return {"ok": True, "reason": "answer", "federation_id": fid, "path": "tap"}
        return _fail("invalid", path="tap")

    async def _speech_name(state, text) -> dict:
        name = clean_name(text)
        if name:
            return {"ok": True, "reason": "answer", "name": name, "path": "rules"}
        out = await llm(NameOut, state, text)
        failed = _from_llm(out)
        if failed:
            return failed
        name = clean_name(out.name or "")
        return (
            {"ok": True, "reason": "answer", "name": name, "path": "llm"}
            if name
            else _fail("unclear", path="llm")
        )

    async def _speech_yes_no(state, text) -> dict:
        lang = state["lang"]
        yn = detect_yes_no(text, lang)
        field = _detect_field(text, lang) if state.get("step") == "confirm" else None
        if field:
            return {"ok": True, "reason": "answer", "yes": False, "field": field, "path": "rules"}
        if yn == "no" and state.get("step") == "name_confirm":
            # "नहीं, मेरा नाम रवि शंकर है" — take the corrected name straight away.
            fixed = clean_name(_LEADING_NO.sub("", normalise(text)))
            if fixed and fixed != state.get("name"):
                return {
                    "ok": True,
                    "reason": "answer",
                    "yes": False,
                    "new_name": fixed,
                    "path": "rules",
                }
        if yn == "yes":
            return {"ok": True, "reason": "answer", "yes": True, "path": "rules"}
        if yn == "no":
            return {"ok": True, "reason": "answer", "yes": False, "field": None, "path": "rules"}
        out = await llm(YesNoOut, state, text)
        failed = _from_llm(out)
        if failed:
            return failed
        if out.answer is None and not out.change_field:
            return _fail("unclear", path="llm")
        return {
            "ok": True,
            "reason": "answer",
            "yes": out.answer == "yes" and not out.change_field,
            "field": out.change_field,
            "path": "llm",
        }

    async def _speech_income(state, text) -> dict:
        parsed = parse_income(text)
        if parsed.bracket:
            return {"ok": True, "reason": "answer", "bracket": parsed.bracket, "path": "rules"}
        out = await llm(IncomeOut, state, text)
        failed = _from_llm(out)
        if failed:
            return failed
        if not out.amount_rupees or out.amount_rupees <= 0:
            return _fail("unclear", path="llm")
        period = out.period or ("month" if out.amount_rupees <= 50_000 else "year")
        yearly = out.amount_rupees * (12 if period == "month" else 1)
        return {"ok": True, "reason": "answer", "bracket": bracket_for(yearly), "path": "llm"}

    async def _speech_categories(state, text) -> dict:
        lang = state["lang"]
        catalog = await catalog_for(lang)
        have = state.get("categories") or []
        matched = match_categories(catalog, text)
        finished = detect_done(text, lang) or detect_yes_no(text, lang) == "yes"
        if matched:
            return {
                "ok": True,
                "reason": "answer",
                "add": matched,
                "confirmed": False,
                "path": "rules",
            }
        if finished and have:
            return {"ok": True, "reason": "answer", "add": [], "confirmed": True, "path": "rules"}
        options = catalog.candidates(text)
        context = "Choose only from these (slug: name):\n" + "\n".join(
            f"{o['slug']}: {o['name']} / {o['en']}" for o in options
        )
        out = await llm(CategoriesOut, state, text, context)
        failed = _from_llm(out)
        if failed:
            return failed
        slugs = [s for s in dict.fromkeys(out.slugs) if s in catalog.slugs]
        if not slugs:
            return _fail("invalid", path="llm")
        return {"ok": True, "reason": "answer", "add": slugs, "confirmed": False, "path": "llm"}

    async def _speech_federation(state, text) -> dict:
        lang = state["lang"]
        options = state.get("federation_options") or []
        yn = detect_yes_no(text, lang)
        if yn == "no" or detect_done(text, lang):
            return {"ok": True, "reason": "answer", "declined": True, "path": "rules"}
        chosen = match_federation(options, text, lang)
        if chosen:
            return {"ok": True, "reason": "answer", "federation_id": chosen, "path": "rules"}
        if yn == "yes" and len(options) == 1:
            return {
                "ok": True,
                "reason": "answer",
                "federation_id": options[0]["id"],
                "path": "rules",
            }
        context = "Federations (id: name):\n" + "\n".join(
            f"{o['id']}: {o['name']}" for o in options
        )
        out = await llm(FederationOut, state, text, context)
        failed = _from_llm(out)
        if failed:
            return failed
        if out.declined:
            return {"ok": True, "reason": "answer", "declined": True, "path": "llm"}
        if any(o["id"] == out.federation_id for o in options):
            return {
                "ok": True,
                "reason": "answer",
                "federation_id": out.federation_id,
                "path": "llm",
            }
        return _fail("unclear", path="llm")

    async def _speech_change(state, text) -> dict:
        field = _detect_field(text, state["lang"])
        if field:
            return {"ok": True, "reason": "answer", "field": field, "path": "rules"}
        out = await llm(YesNoOut, state, text)
        failed = _from_llm(out)
        if failed:
            return failed
        if out.change_field:
            return {"ok": True, "reason": "answer", "field": out.change_field, "path": "llm"}
        return _fail("unclear", path="llm")

    SPEECH = {
        "name": _speech_name,
        "name_confirm": _speech_yes_no,
        "income": _speech_income,
        "categories": _speech_categories,
        "federation": _speech_federation,
        "confirm": _speech_yes_no,
        "change": _speech_change,
    }

    # ── decide ──────────────────────────────────────────────────────────────

    def _after(state, step: str, updates: dict) -> str:
        """Next step once `step` is answered."""
        merged = {**state, **updates}
        if merged.get("return_to_confirm") and step not in ("name",):
            return "confirm"
        if step == "name":
            return "name_confirm"
        if step == "name_confirm":
            return "income"
        if step == "income":
            return "categories"
        if step == "categories":
            return "federation" if merged.get("federation_options") else "confirm"
        return "confirm"

    async def decide(state: OnboardingState) -> dict:
        o = state.get("outcome") or {}
        step = state.get("step")
        attempts = dict(state.get("attempts") or {})

        if o.get("reason") == "start":
            first = "name" if not state.get("name") else "income"
            return {"step": first, "ack": [], "attempts": attempts}

        if step in ("done", "handoff"):
            return {"ack": []}

        if not o.get("ok"):
            key = "name" if step in ("name", "name_confirm") else step
            attempts[key] = attempts.get(key, 0) + 1
            limit = NAME_HANDOFF_AFTER if key == "name" else HANDOFF_AFTER
            if attempts[key] >= limit:
                return {"attempts": attempts, "step": "handoff", "handoff": True, "ack": []}
            return {"attempts": attempts, "ack": []}

        if step not in ("name", "name_confirm"):
            attempts[step] = 0
        up: dict = {"attempts": attempts, "ack": []}

        if step == "name":
            up["name"] = o["name"]
        elif step == "name_confirm":
            if not o.get("yes"):
                attempts["name"] = attempts.get("name", 0) + 1
                if attempts["name"] >= NAME_HANDOFF_AFTER:
                    return {**up, "step": "handoff", "handoff": True}
                if o.get("new_name"):
                    return {**up, "name": o["new_name"], "step": "name_confirm"}
                return {**up, "name": None, "step": "name"}
            attempts["name"] = attempts["name_confirm"] = 0
        elif step == "income":
            up["income_bracket"] = o["bracket"]
            up["ack"] = [
                ("income_heard", {"bracket": msg(state["lang"], f"bracket_{o['bracket']}")})
            ]
        elif step == "categories":
            have = list(state.get("categories") or [])
            chosen = o["set"] if "set" in o else have + [s for s in o["add"] if s not in have]
            up["categories"] = chosen[:MAX_CATEGORIES]
            if not (o.get("confirmed") and up["categories"]):
                return up  # stay and let them add more / confirm
        elif step == "federation":
            if o.get("declined"):
                up["federation_id"] = None
                up["ack"] = [("federation_skip", {})]
            else:
                up["federation_id"] = o["federation_id"]
                name = next(
                    (
                        f["name"]
                        for f in state["federation_options"]
                        if f["id"] == o["federation_id"]
                    ),
                    "",
                )
                up["ack"] = [("federation_heard", {"federation": name})]
            up["federation_decided"] = True
        elif step == "confirm":
            if o.get("yes"):
                up["step"] = "done"
                up["done"] = True
                return up
            if o.get("field"):
                return {**up, **_go_change(state, o["field"])}
            up["step"] = "change"
            return up
        elif step == "change":
            return {**up, **_go_change(state, o["field"])}

        up["step"] = _after(state, step, up)
        if up["step"] == "confirm":
            up["return_to_confirm"] = False
        return up

    def _go_change(state, field: str) -> dict:
        if field == "name" and state.get("verified_name"):
            return {"step": "confirm"}  # Aadhaar name can't be changed here
        if field == "federation" and not state.get("federation_options"):
            return {"step": "confirm"}
        target = {
            "name": "name",
            "income": "income",
            "categories": "categories",
            "federation": "federation",
        }[field]
        return {"step": target, "return_to_confirm": True}

    # ── ask ─────────────────────────────────────────────────────────────────

    async def ask(state: OnboardingState) -> dict:
        lang = state["lang"]
        step = state.get("step")
        o = state.get("outcome") or {}
        tries = (state.get("attempts") or {}).get(step, 0)
        parts: list[str] = []

        if o.get("reason") == "start":
            parts.append(msg(lang, "intro"))
        elif not o.get("ok") and step != "handoff":
            parts.append(_failure_line(lang, step, o))
        for key, kw in state.get("ack") or []:
            parts.append(msg(lang, key, **kw))

        catalog = await catalog_for(lang) if step in ("categories", "confirm", "done") else None
        question, ui = _question(state, step, tries, o, catalog)
        if question:
            parts.append(question)
        if tries >= BUTTONS_AFTER and step in ("income", "name_confirm", "confirm", "change"):
            parts.append(msg(lang, "use_buttons"))
        return {"speak": " ".join(parts), "ui": ui}

    def _failure_line(lang, step, o) -> str:
        reason = o.get("reason")
        if reason == "not_heard":
            return msg(lang, "not_heard")
        if reason == "off_topic":
            redirect = (o.get("redirect") or "").strip()
            if redirect and len(redirect) <= 200 and in_script(redirect, lang):
                return redirect
            return msg(lang, "redirect")
        if step == "categories" and reason == "invalid":
            return msg(lang, "categories_none")
        return msg(lang, "unclear")

    def _question(state, step, tries, o, catalog):
        lang = state["lang"]
        yesno = {"type": "yesno"}
        if step == "name":
            return msg(lang, "ask_name"), None
        if step == "name_confirm":
            return msg(lang, "confirm_name", name=state.get("name")), yesno
        if step == "income":
            key = "ask_income_retry" if tries > 0 else "ask_income"
            ui = None
            if tries >= BUTTONS_AFTER:
                ui = {
                    "type": "income",
                    "options": [
                        {"value": b, "label": msg(lang, f"bracket_{b}")} for b in INCOME_BRACKETS
                    ],
                }
            return msg(lang, key), ui
        if step == "categories":
            selected = list(state.get("categories") or [])
            ui = {"type": "categories", "selected": selected, "max": MAX_CATEGORIES}
            if selected and o.get("ok") and o.get("reason") == "answer":
                names = ", ".join(catalog.name(s) for s in selected)
                return msg(lang, "categories_heard", categories=names), ui
            return msg(lang, "ask_categories"), ui
        if step == "federation":
            ui = {"type": "federations", "options": list(state.get("federation_options") or [])}
            return msg(lang, "ask_federation"), ui
        if step == "confirm":
            return msg(lang, "ask_confirm", summary=_summary(state, catalog)), _summary_ui(state)
        if step == "change":
            return msg(lang, "ask_change"), {"type": "fields"}
        if step == "done":
            return msg(lang, "done"), _summary_ui(state)
        if step == "handoff":
            return msg(lang, "handoff"), None
        return "", None

    def _summary(state, catalog) -> str:
        lang = state["lang"]
        fed = next(
            (
                f["name"]
                for f in state.get("federation_options") or []
                if f["id"] == state.get("federation_id")
            ),
            msg(lang, "none"),
        )
        parts = [
            f"{msg(lang, 'field_name')}: {state.get('name') or msg(lang, 'none')}",
            f"{msg(lang, 'field_income')}: "
            + (
                msg(lang, f"bracket_{state['income_bracket']}")
                if state.get("income_bracket")
                else msg(lang, "none")
            ),
            f"{msg(lang, 'field_categories')}: "
            + ", ".join(catalog.name(s) for s in state.get("categories") or []),
        ]
        if state.get("federation_options"):
            parts.append(f"{msg(lang, 'field_federation')}: {fed}")
        return "; ".join(parts)

    def _summary_ui(state) -> dict:
        return {
            "type": "summary",
            "filled": {
                "name": state.get("name"),
                "incomeBracket": state.get("income_bracket"),
                "categories": list(state.get("categories") or []),
                "federationId": state.get("federation_id"),
            },
        }

    graph = StateGraph(OnboardingState)
    graph.add_node("understand", understand)
    graph.add_node("decide", decide)
    graph.add_node("ask", ask)
    graph.add_edge(START, "understand")
    graph.add_edge("understand", "decide")
    graph.add_edge("decide", "ask")
    graph.add_edge("ask", END)
    return graph.compile(checkpointer=checkpointer)
