"""Camel-case base + pagination envelope.

Public JSON is camelCase; DB columns are snake_case. `alias_generator=to_camel`
plus `populate_by_name` accepts both spellings on input and emits camelCase.
"""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class Page[T](CamelModel):
    items: list[T]
    total: int
    page: int = 1
    page_size: int = 50


class PaginationParams(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=200)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


class MessageResponse(CamelModel):
    message: str
    extra: dict[str, Any] | None = None
