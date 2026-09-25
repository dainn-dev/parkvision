"""Shared query helpers for routers."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import not_found


async def get_or_404[M](db: AsyncSession, model: type[M], ident: UUID, message: str | None = None) -> M:
    obj = await db.get(model, ident)
    if obj is None:
        raise not_found(message or f"{model.__name__} not found")
    return obj


async def paginate(
    db: AsyncSession,
    stmt,
    count_stmt,
    *,
    page: int,
    page_size: int,
) -> tuple[list, int]:
    total = (await db.execute(count_stmt)).scalar_one()
    result = await db.execute(stmt.offset((page - 1) * page_size).limit(page_size))
    return list(result.scalars().all()), int(total)


def count_of(model) -> object:
    return select(func.count()).select_from(model)


def apply_update(obj, payload) -> None:
    """Apply a CamelModel update — only fields the caller explicitly set."""
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
