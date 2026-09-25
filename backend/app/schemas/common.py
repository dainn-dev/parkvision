"""Pydantic base with camelCase aliasing + the pagination envelope."""

from typing import Any, TypeVar

from fastapi import Query
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
        use_enum_values=True,
    )


T = TypeVar("T")


class Page[T](ApiModel):
    items: list[T]
    total: int
    page: int
    page_size: int


def page_params(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    q: str | None = Query(None),
) -> tuple[int, int, str | None]:
    return page, page_size, q


def page_of(items: list[Any], total: int, page: int, page_size: int) -> dict[str, Any]:
    return {"items": items, "total": total, "page": page, "pageSize": page_size}
