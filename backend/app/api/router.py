from fastapi import APIRouter

from app.api.routes import (
    audit,
    auth,
    events,
    incidents,
    platform,
    public,
    rules,
    tenant,
    vehicles,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(public.router)
api_router.include_router(auth.router)
api_router.include_router(platform.router)
api_router.include_router(tenant.router)
api_router.include_router(vehicles.router)
api_router.include_router(rules.router)
api_router.include_router(events.router)
api_router.include_router(incidents.router)
api_router.include_router(audit.router)
