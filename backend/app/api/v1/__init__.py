"""API v1 router aggregation."""

from fastapi import APIRouter

from app.api.v1 import auth, edge, platform, public, ws
from app.api.v1.tenant import audit, events, gates, rules, sites, users, vehicles

api_v1 = APIRouter()
api_v1.include_router(public.router)
api_v1.include_router(auth.router)
api_v1.include_router(platform.router)
api_v1.include_router(edge.router)
api_v1.include_router(sites.router)
api_v1.include_router(gates.router)
api_v1.include_router(vehicles.router)
api_v1.include_router(users.router)
api_v1.include_router(rules.router)
api_v1.include_router(events.router)
api_v1.include_router(audit.router)

# WebSocket routes live outside /api/v1 prefix semantics but are mounted at app level.
ws_router = ws.router
