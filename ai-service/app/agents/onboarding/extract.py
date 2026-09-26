"""Onboarding-specific extraction schemas. Shared pieces (Intent, LANGUAGE_NAMES,
BaseOut, SYSTEM_PROMPT, Extractor, GeminiExtractor, NullExtractor) now live in
`app.agents.common.extract`.
"""

from typing import Literal

from pydantic import Field

from app.agents.common.extract import (  # noqa: F401
    LANGUAGE_NAMES,
    SYSTEM_PROMPT,
    BaseOut,
    Extractor,
    GeminiExtractor,
    Intent,
    NullExtractor,
    _Base,
)

Field_ = Literal["name", "income", "categories", "federation"]


class NameOut(BaseOut):
    name: str | None = Field(default=None, description="The person's full name as they said it.")


class IncomeOut(BaseOut):
    amount_rupees: int | None = Field(default=None, description="Amount in rupees, as a number.")
    period: Literal["year", "month"] | None = None


class CategoriesOut(BaseOut):
    slugs: list[str] = Field(default_factory=list, description="Slugs from the given list only.")


class YesNoOut(BaseOut):
    answer: Literal["yes", "no"] | None = None
    change_field: Field_ | None = Field(
        default=None, description="If they said no and named what to change."
    )


class FederationOut(BaseOut):
    federation_id: str | None = Field(default=None, description="An id from the given list only.")
    declined: bool = False
