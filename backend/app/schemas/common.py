import uuid
from datetime import datetime, timezone
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field


def to_camel(s: str) -> str:
    head, *rest = s.split("_")
    return head + "".join(p.title() for p in rest)


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
        use_enum_values=True,
    )


T = TypeVar("T")


class PageMeta(CamelModel):
    page: int
    limit: int
    total: int


class Page(CamelModel, Generic[T]):
    data: list[T]
    meta: PageMeta


def paginate(items: list[T], total: int, page: int, limit: int) -> Page[T]:
    return Page[T](data=items, meta=PageMeta(page=page, limit=limit, total=total))


class IdOut(CamelModel):
    id: uuid.UUID


class MessageOut(CamelModel):
    message: str


class HealthOut(CamelModel):
    status: str
    version: str = "0.1.0"
    time: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    checks: dict[str, Any] = {}
