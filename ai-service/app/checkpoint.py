"""Where conversation state lives between turns."""

import logging

from langgraph.checkpoint.memory import InMemorySaver

from app.config import Settings

log = logging.getLogger(__name__)

SESSION_TTL_S = 24 * 3600


def make_checkpointer(settings: Settings):
    """(saver, close). MongoDB when MONGODB_URI is set — sessions survive a
    restart and expire after a day — otherwise in memory (local dev/tests)."""
    if not settings.mongodb_uri:
        log.warning("MONGODB_URI not set: onboarding sessions are kept in memory only")
        return InMemorySaver(), lambda: None
    from langgraph.checkpoint.mongodb import MongoDBSaver
    from pymongo import MongoClient

    client = MongoClient(settings.mongodb_uri)
    saver = MongoDBSaver(client, db_name="ai_service", ttl=SESSION_TTL_S)
    return saver, client.close
