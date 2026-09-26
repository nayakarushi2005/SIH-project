"""Small helpers shared by agent graphs for turning outcomes into flow control."""

from app.agents.common.lexicon import in_script


def fail(reason: str, redirect: str | None = None, path: str = "rules") -> dict:
    return {"ok": False, "reason": reason, "redirect": redirect, "path": path}


def from_llm(out) -> dict | None:
    """A failed/declined LLM reading as a failure outcome, or None if it answered."""
    if out is None:
        return fail("unclear", path="llm")
    if out.intent != "answer":
        reason = "off_topic" if out.intent == "off_topic" else "unclear"
        return fail(reason, out.redirect, "llm")
    return None


def safe_redirect(redirect: str | None, lang: str, max_len: int = 200) -> str | None:
    """The LLM's redirect line, only if it's short and in the session's script."""
    redirect = (redirect or "").strip()
    if redirect and len(redirect) <= max_len and in_script(redirect, lang):
        return redirect
    return None
