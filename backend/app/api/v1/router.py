"""Aggregated /api/v1 router."""

from fastapi import APIRouter

from app.api.v1 import auth, platform, public, tenant_fleet, tenant_ops, tenant_sites, tenant_users, ws

api_router = APIRouter()
api_router.include_router(public.router, prefix="/api/v1")
api_router.include_router(auth.router, prefix="/api/v1")
api_router.include_router(platform.router, prefix="/api/v1")
api_router.include_router(tenant_sites.router, prefix="/api/v1")
api_router.include_router(tenant_users.router, prefix="/api/v1")
api_router.include_router(tenant_fleet.router, prefix="/api/v1")
api_router.include_router(tenant_ops.router, prefix="/api/v1")
api_router.include_router(ws.router)
