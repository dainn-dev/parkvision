"""Shared schema conventions.

Public API uses camelCase (per the architecture document) while the code and
database use snake_case; the alias generator bridges both.
"""

from datetime import datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict


def to_camel(s: str) -> str:
    head, *tail = s.split("_")
    return head + "".join(p.title() for p in tail)


class ApiSchema(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class ErrorBody(ApiSchema):
    code: str
    message: str
    details: dict | None = None


class ErrorResponse(ApiSchema):
    error: ErrorBody


T = TypeVar("T")


class PageInfo(ApiSchema):
    next_cursor: str | None = None
    has_more: bool = False
    total: int | None = None


class Page(ApiSchema, Generic[T]):
    data: list[T]
    page: PageInfo


class IdResponse(ApiSchema):
    id: str


class OkResponse(ApiSchema):
    ok: bool = True


class TimestampsSchema(ApiSchema):
    created_at: datetime | None = None
    updated_at: datetime | None = None
