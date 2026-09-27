"""The job posting conversation as a LangGraph state machine.

One graph run per user turn:  START → understand → decide → ask → END.

- understand: read this turn's answer for the current step. Taps are taken
  as-is (after validation); speech goes through the rule-based parsers
  first and the LLM only if they can't tell. The one exception is the
  description, which the LLM tidies into a short draft (falling back to the
  cleaned transcript) that the client then confirms.
- decide: accept the answer and move to the next step, or count a failed
  try (tap/typed choices after 3, hand off to the form after 6).
- ask: say the next question from the fixed templates, in the user's
  language, and describe the choices to show.

The code, not the model, decides what is asked and in which order.
"""

import logging
import time
from collections.abc import Awaitable, Callable

from langgraph.graph import END, START, StateGraph

from app.agents.common import lexicon as lx
from app.agents.common.catalog import Catalog, match_categories
from app.agents.common.flow import fail, from_llm, safe_redirect
from app.agents.common.parsers import (
    _has,
    detect_change,
    detect_done,
    detect_yes_no,
    normalise,
    parse_amount,
    parse_duration,
)
from app.agents.job_posting.extract import (
    DRAFT_SYSTEM_PROMPT,
    CategoryOut,
    DescriptionOut,
    DurationOut,
    Extractor,
    JobYesNoOut,
    PriceOut,
)
from app.agents.job_posting.messages import MESSAGES, msg
from app.agents.job_posting.state import (
    ADDRESS_MAX,
    ADDRESS_MIN,
    BUTTONS_AFTER,
    DESC_MIN,
    DESCRIPTION_HANDOFF_AFTER,
    DURATION_MAX,
    DURATION_MIN,
    DURATION_PRESETS,
    FIELDS,
    HANDOFF_AFTER,
    PRICE_MAX,
    PRICE_MIN,
    JobPostingState,
)
from app.agents.job_posting.text import clean_dictation, sanitize_draft

log = logging.getLogger(__name__)

CatalogFor = Callable[[str], Awaitable[Catalog]]

SUMMARY_DESC_MAX = 120
# A bare "no"/"done" skips the address, but only as a short reply:
# "shop no 5, MG road" or "बस स्टैंड के पास" are addresses.
_SKIP_REPLY_MAX_WORDS = 3

# Extra words for each editable field, beyond its `field_*` label.
_FIELD_EXTRAS = {
    "category": ["kaam", "work", "service", "काम", "সেবা", "வேலை", "పని"],
    "description": ["detail", "vivaran", "विवरण", "बयान", "বিবরণ", "விவரம்", "వివరణ"],
    "price": [
        "paisa",
        "daam",
        "rate",
        "rupaye",
        "kimat",
        "कीमत",
        "दाम",
        "पैसे",
        "किंमत",
        "দাম",
        "টাকা",
        "விலை",
        "ధర",
    ],
    "duration": ["time", "samay", "waqt", "समय", "वक्त", "वेळ", "সময়", "நேரம்", "సమయం"],
    "address": ["pata", "पता", "पत्ता", "ঠিকানা", "முகவரி", "చిరునామా"],
}


def _field_words(lang: str, field: str) -> list[str]:
    key = f"field_{field}"
    words = {normalise(MESSAGES["en"][key]), normalise(MESSAGES.get(lang, {}).get(key, ""))}
    words |= {normalise(w) for w in _FIELD_EXTRAS[field]}
    return [w for w in words if w]


def _detect_field(text: str, lang: str) -> str | None:
    t = normalise(text)
    for field in FIELDS:
        if _has(_field_words(lang, field), t):
            return field
    return None


def _attempt_key(step: str | None) -> str | None:
    return "description" if step in ("description", "description_confirm") else step


def _say_duration(lang: str, mins: int) -> str:
    """A duration as a short spoken phrase: presets by name, else rounded."""
    presets = {
        60: ("dur_hour", {}),
        240: ("dur_half_day", {}),
        480: ("dur_full_day", {}),
    }
    if mins in presets:
        key, kw = presets[mins]
        return msg(lang, key, **kw)
    if mins < 60:
        return msg(lang, "dur_minutes", n=mins)
    if mins < 36 * 60:
        hours = int(mins / 60 + 0.5)
        return msg(lang, "dur_hour") if hours == 1 else msg(lang, "dur_hours", n=hours)
    return msg(lang, "dur_days", n=int(mins / 1440 + 0.5))


def _short(text: str, limit: int = SUMMARY_DESC_MAX) -> str:
    """`text` cut to `limit` characters at a word boundary."""
    text = text.rstrip(" .।!?")  # the summary adds its own separators
    if len(text) <= limit:
        return text
    cut = text[:limit]
    space = cut.rfind(" ")
    return (cut[:space] if space > 0 else cut).rstrip(" ,.;:।") + "…"


def _question_for(state: JobPostingState) -> str:
    """The question currently on screen, in English, for the LLM prompt."""
    return {
        "category": "What kind of work (service) is it?",
        "description": "Describe the work you need done.",
        "description_confirm": "Is this job description okay? (yes/no)",
        "price": "How much will you pay for this work, in rupees?",
        "duration": "How long should the work take?",
        "address": "Any address or landmark for the worker? (or skip)",
        "confirm": "Shall I post this job? (yes/no, or what to change)",
        "change": "What do you want to change: work type, description, price, time or address?",
    }.get(state.get("step", ""), "")


def _ok(path: str, **kw) -> dict:
    return {"ok": True, "reason": "answer", "path": path, **kw}


def build_graph(extractor: Extractor, catalog_for: CatalogFor, checkpointer):
    async def llm(schema, state, transcript, context="", system=None):
        return await extractor.extract(
            schema,
            lang=state["lang"],
            question=_question_for(state),
            transcript=transcript,
            context=context,
            system=system,
        )

    # ── understand ──────────────────────────────────────────────────────────

    async def understand(state: JobPostingState) -> dict:
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
                outcome = fail("not_heard")
            else:
                handler = SPEECH.get(step)
                outcome = await handler(state, text) if handler else fail("invalid")
        log.info(
            "turn step=%s reason=%s path=%s ms=%d lang=%s",
            step,
            outcome.get("reason"),
            outcome.get("path"),
            (time.monotonic() - started) * 1000,
            lang,
        )
        return {"outcome": outcome}

    def _int(value) -> int | None:
        return value if isinstance(value, int) and not isinstance(value, bool) else None

    async def _understand_tap(state, sel) -> dict:
        step = state.get("step")
        if step in ("description_confirm", "confirm") and isinstance(sel.get("yes"), bool):
            return _ok("tap", yes=sel["yes"])
        if step in ("confirm", "change") and sel.get("field") in FIELDS:
            return _ok("tap", yes=False, field=sel["field"])
        if step == "category" and isinstance(sel.get("category"), str):
            catalog = await catalog_for(state["lang"])
            if sel["category"] in catalog.slugs:
                slug = sel["category"]
                return _ok("tap", slug=slug, name=catalog.name(slug))
        if step in ("description", "description_confirm") and isinstance(
            sel.get("description"), str
        ):
            draft = clean_dictation(sel["description"])
            if len(draft) < DESC_MIN:
                return fail("too_short", path="tap")
            return _ok("tap", draft=draft, source="transcript")
        if step == "price" and _int(sel.get("price")) is not None:
            return _price(sel["price"], "tap")
        if step == "duration" and _int(sel.get("durationMins")) is not None:
            return _duration(sel["durationMins"], "tap")
        if step == "address":
            if sel.get("skip") is True:
                return _ok("tap", address=None)
            if isinstance(sel.get("address"), str):
                return _address(sel["address"], "tap")
        return fail("invalid", path="tap")

    def _price(amount: int, path: str) -> dict:
        if PRICE_MIN <= amount <= PRICE_MAX:
            return _ok(path, price=amount)
        return fail("out_of_range", path=path)

    def _duration(mins: int, path: str) -> dict:
        if DURATION_MIN <= mins <= DURATION_MAX:
            return _ok(path, minutes=mins)
        return fail("out_of_range", path=path)

    def _address(text: str, path: str) -> dict:
        address = " ".join(lx.nfc(text).split()).strip(" ,.;:")
        if len(address) < ADDRESS_MIN:
            return fail("too_short", path=path)
        return _ok(path, address=address[:ADDRESS_MAX].rstrip())

    async def _speech_category(state, text) -> dict:
        catalog = await catalog_for(state["lang"])
        matched = match_categories(catalog, text)
        if len(matched) == 1:
            return _ok("rules", slug=matched[0], name=catalog.name(matched[0]))
        if len(matched) > 1:
            return {"ok": False, "reason": "ambiguous", "options": matched, "path": "rules"}
        options = catalog.candidates(text)
        context = "Choose only from these (slug: name):\n" + "\n".join(
            f"{o['slug']}: {o['name']} / {o['en']}" for o in options
        )
        out = await llm(CategoryOut, state, text, context)
        failed = from_llm(out)
        if failed:
            return failed
        if out.slug not in catalog.slugs:
            return fail("invalid", path="llm")
        return _ok("llm", slug=out.slug, name=catalog.name(out.slug))

    async def _speech_description(state, text) -> dict:
        if len(normalise(text)) < DESC_MIN:
            return fail("too_short")
        lang = state["lang"]
        context = ""
        if state.get("category"):
            catalog = await catalog_for(lang)
            cat = next((c for c in catalog.categories if c.slug == state["category"]), None)
            if cat:
                context = f"Category: {cat.name} ({cat.en_name})"
        out = await llm(DescriptionOut, state, text, context, system=DRAFT_SYSTEM_PROMPT)
        if out is not None:
            failed = from_llm(out)
            if failed:
                return failed
            draft = sanitize_draft(out.description or "", lang)
            if draft:
                return _ok("llm", draft=draft, source="llm")
        # No LLM, no usable draft: the tidied transcript is the draft.
        draft = clean_dictation(text)
        if len(draft) < DESC_MIN:
            return fail("too_short")
        return _ok("rules" if out is None else "llm", draft=draft, source="transcript")

    async def _speech_yes_no(state, text) -> dict:
        lang = state["lang"]
        step = state.get("step")
        yn = detect_yes_no(text, lang)
        field = _detect_field(text, lang) if step == "confirm" else None
        # "yes, the price is right" names a field but confirms it; only a
        # "no"/"wrong" or a "change" turns a mentioned field into an edit.
        if field and yn == "yes" and not detect_change(text, lang):
            field = None
        if field:
            return _ok("rules", yes=False, field=field)
        if yn:
            return _ok("rules", yes=yn == "yes", field=None)
        out = await llm(JobYesNoOut, state, text)
        failed = from_llm(out)
        if failed:
            return failed
        change_field = out.change_field if step == "confirm" else None
        if out.answer is None and not change_field:
            return fail("unclear", path="llm")
        return _ok("llm", yes=out.answer == "yes" and not change_field, field=change_field)

    async def _speech_price(state, text) -> dict:
        amount = parse_amount(text)
        if amount is not None:
            return _price(amount, "rules")
        out = await llm(PriceOut, state, text)
        failed = from_llm(out)
        if failed:
            return failed
        if out.amount_rupees is None:
            return fail("unclear", path="llm")
        return _price(out.amount_rupees, "llm")

    async def _speech_duration(state, text) -> dict:
        mins = parse_duration(text, state["lang"])
        if mins is not None:
            return _duration(mins, "rules")
        out = await llm(DurationOut, state, text)
        failed = from_llm(out)
        if failed:
            return failed
        if out.minutes is None:
            return fail("unclear", path="llm")
        return _duration(out.minutes, "llm")

    async def _speech_address(state, text) -> dict:
        lang = state["lang"]
        t = normalise(text)
        short = len(t.split()) <= _SKIP_REPLY_MAX_WORDS
        if (
            _has(lx.SKIP, t)
            or (short and detect_yes_no(text, lang) == "no")
            or (short and detect_done(text, lang))
        ):
            return _ok("rules", address=None)
        return _address(text, "rules")

    async def _speech_change(state, text) -> dict:
        field = _detect_field(text, state["lang"])
        if field:
            return _ok("rules", field=field)
        out = await llm(JobYesNoOut, state, text)
        failed = from_llm(out)
        if failed:
            return failed
        if out.change_field:
            return _ok("llm", field=out.change_field)
        return fail("unclear", path="llm")

    SPEECH = {
        "category": _speech_category,
        "description": _speech_description,
        "description_confirm": _speech_yes_no,
        "price": _speech_price,
        "duration": _speech_duration,
        "address": _speech_address,
        "confirm": _speech_yes_no,
        "change": _speech_change,
    }

    # ── decide ──────────────────────────────────────────────────────────────

    _NEXT = {
        "category": "description",
        "description": "description_confirm",
        "description_confirm": "price",
        "price": "duration",
        "duration": "address",
        "address": "confirm",
    }

    def _after(state, step: str) -> str:
        """Next step once `step` is answered."""
        if step == "description":
            return "description_confirm"  # a draft is always confirmed first
        if state.get("return_to_confirm"):
            return "confirm"
        return _NEXT.get(step, "confirm")

    def _handoff_if_spent(attempts: dict, key: str) -> dict | None:
        limit = DESCRIPTION_HANDOFF_AFTER if key == "description" else HANDOFF_AFTER
        if attempts[key] >= limit:
            return {"attempts": attempts, "step": "handoff", "handoff": True, "ack": []}
        return None

    async def decide(state: JobPostingState) -> dict:
        o = state.get("outcome") or {}
        step = state.get("step")
        lang = state["lang"]
        attempts = dict(state.get("attempts") or {})

        if o.get("reason") == "start":
            first = "description" if state.get("category") else "category"
            return {"step": first, "ack": [], "attempts": attempts}

        if step in ("done", "handoff"):
            return {"ack": []}

        key = _attempt_key(step)
        if not o.get("ok"):
            attempts[key] = attempts.get(key, 0) + 1
            return _handoff_if_spent(attempts, key) or {"attempts": attempts, "ack": []}

        if key != "description":
            attempts[key] = 0
        up: dict = {"attempts": attempts, "ack": []}

        if step == "category":
            up["category"] = o["slug"]
            up["ack"] = [("category_heard", {"category": o["name"]})]
        elif step == "description":
            up["description_draft"] = o["draft"]
            up["description_source"] = o["source"]
        elif step == "description_confirm":
            if "draft" in o:  # an edited draft typed on the screen: confirm it again
                return {
                    **up,
                    "description_draft": o["draft"],
                    "description_source": o["source"],
                    "step": "description_confirm",
                }
            if not o.get("yes"):
                attempts["description"] = attempts.get("description", 0) + 1
                spent = _handoff_if_spent(attempts, "description")
                if spent:
                    return spent
                return {
                    **up,
                    "description_draft": None,
                    "description_source": None,
                    "step": "description",
                    "ack": [("description_redo", {})],
                }
            up["description"] = state.get("description_draft")
            attempts["description"] = 0
        elif step == "price":
            up["price"] = o["price"]
            up["ack"] = [("price_heard", {"rupees": o["price"]})]
        elif step == "duration":
            up["duration_mins"] = o["minutes"]
            up["ack"] = [("duration_heard", {"duration": _say_duration(lang, o["minutes"])})]
        elif step == "address":
            up["address"] = o["address"]
            up["address_decided"] = True
            up["ack"] = [("address_heard" if o["address"] else "address_skip", {})]
        elif step == "confirm":
            if o.get("yes"):
                return {**up, "step": "done", "done": True}
            if o.get("field"):
                return {**up, "step": o["field"], "return_to_confirm": True}
            return {**up, "step": "change"}
        elif step == "change":
            return {**up, "step": o["field"], "return_to_confirm": True}

        up["step"] = _after(state, step)
        if up["step"] == "confirm":
            up["return_to_confirm"] = False
        return up

    # ── ask ─────────────────────────────────────────────────────────────────

    async def ask(state: JobPostingState) -> dict:
        lang = state["lang"]
        step = state.get("step")
        o = state.get("outcome") or {}
        tries = (state.get("attempts") or {}).get(_attempt_key(step), 0)
        failed = not o.get("ok")
        parts: list[str] = []

        catalog = await catalog_for(lang) if step in ("category", "confirm") else None
        if o.get("reason") == "start":
            parts.append(msg(lang, "intro"))
        elif failed and step != "handoff":
            parts.append(_failure_line(lang, step, o, catalog))
        for key, kw in state.get("ack") or []:
            parts.append(msg(lang, key, **kw))

        question, ui = _question(state, step, tries, failed, o, catalog)
        if question:
            parts.append(question)
        # Choices that appear because of failures are announced once.
        if failed and tries == BUTTONS_AFTER and step in _FAILURE_UI_STEPS:
            parts.append(msg(lang, "use_buttons"))
        return {"speak": " ".join(parts), "ui": ui}

    _FAILURE_UI_STEPS = ("description", "price", "duration", "address")

    def _failure_line(lang, step, o, catalog) -> str:
        reason = o.get("reason")
        if reason == "not_heard":
            return msg(lang, "not_heard")
        if reason == "off_topic":
            return safe_redirect(o.get("redirect"), lang) or msg(lang, "redirect")
        if reason == "too_short":
            return msg(lang, "address_short" if step == "address" else "description_short")
        if reason == "out_of_range":
            return msg(lang, "duration_range" if step == "duration" else "price_range")
        if reason == "ambiguous" and catalog:
            names = ", ".join(catalog.name(s) for s in o.get("options") or [])
            return msg(lang, "category_which", options=names)
        if step == "category" and reason == "invalid":
            return msg(lang, "category_none")
        return msg(lang, "unclear")

    def _question(state, step, tries, failed, o, catalog):
        lang = state["lang"]
        buttons = tries >= BUTTONS_AFTER
        retry = failed and tries > 0
        if step == "category":
            options = None
            if o.get("reason") == "ambiguous" and catalog:
                options = [{"slug": s, "name": catalog.name(s)} for s in o["options"]]
                return "", {"type": "category", "options": options}
            return msg(lang, "ask_category"), {"type": "category", "options": options}
        if step == "description":
            key = "ask_description_retry" if retry else "ask_description"
            return msg(lang, key), ({"type": "text", "field": "description"} if buttons else None)
        if step == "description_confirm":
            draft = state.get("description_draft") or ""
            ui = {"type": "description", "text": draft, "source": state.get("description_source")}
            return msg(lang, "draft_confirm", description=draft), ui
        if step == "price":
            key = "ask_price_retry" if retry else "ask_price"
            return msg(lang, key), ({"type": "text", "field": "price"} if buttons else None)
        if step == "duration":
            key = "ask_duration_retry" if retry else "ask_duration"
            ui = {"type": "duration", "options": list(DURATION_PRESETS)} if buttons else None
            return msg(lang, key), ui
        if step == "address":
            ui = {"type": "skip", "text": True} if buttons else {"type": "skip"}
            return msg(lang, "ask_address"), ui
        if step == "confirm":
            return msg(lang, "ask_confirm", summary=_summary(state, catalog)), {"type": "summary"}
        if step == "change":
            return msg(lang, "ask_change"), {"type": "fields"}
        if step == "done":
            return msg(lang, "done"), None
        if step == "handoff":
            return msg(lang, "handoff"), None
        return "", None

    def _summary(state, catalog) -> str:
        lang = state["lang"]
        none = msg(lang, "none")
        category = state.get("category")
        price = state.get("price")
        mins = state.get("duration_mins")
        parts = [
            (
                "field_category",
                catalog.name(category) if category and catalog else category or none,
            ),
            ("field_description", _short(state.get("description") or "") or none),
            ("field_price", msg(lang, "summary_price", rupees=price) if price else none),
            ("field_duration", _say_duration(lang, mins) if mins else none),
            ("field_address", state.get("address") or none),
        ]
        return "; ".join(f"{msg(lang, key)}: {value}" for key, value in parts)

    graph = StateGraph(JobPostingState)
    graph.add_node("understand", understand)
    graph.add_node("decide", decide)
    graph.add_node("ask", ask)
    graph.add_edge(START, "understand")
    graph.add_edge("understand", "decide")
    graph.add_edge("decide", "ask")
    graph.add_edge("ask", END)
    return graph.compile(checkpointer=checkpointer)
