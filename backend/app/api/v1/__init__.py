"""API v1 router aggregation."""

from fastapi import APIRouter, Depends

from app.api.deps import csrf_protect
from app.api.v1 import auth, edge, platform, public, ws
from app.api.v1.driver import auth as driver_auth
from app.api.v1.driver import favorites as driver_favorites
from app.api.v1.driver import memberships as driver_memberships
from app.api.v1.driver import payments as driver_payments
from app.api.v1.driver import sessions as driver_sessions
from app.api.v1.driver import vehicles as driver_vehicles
from app.api.v1.tenant import audit, cameras, events, gates, memberships, parking, payments, rules, sites, users, vehicles

api_v1 = APIRouter()
api_v1.include_router(public.router)
api_v1.include_router(auth.router)
# Driver routes accept bearer tokens *or* HttpOnly cookies; csrf_protect is a
# no-op for bearer clients and enforces double-submit for cookie clients.
_driver_csrf = [Depends(csrf_protect)]
api_v1.include_router(driver_auth.router, dependencies=_driver_csrf)
api_v1.include_router(driver_vehicles.router, dependencies=_driver_csrf)
api_v1.include_router(driver_sessions.router, dependencies=_driver_csrf)
api_v1.include_router(driver_favorites.router, dependencies=_driver_csrf)
api_v1.include_router(driver_memberships.router, dependencies=_driver_csrf)
api_v1.include_router(driver_payments.router, dependencies=_driver_csrf)
api_v1.include_router(platform.router)
api_v1.include_router(edge.router)
api_v1.include_router(sites.router)
api_v1.include_router(cameras.router)
api_v1.include_router(parking.router)
api_v1.include_router(gates.router)
api_v1.include_router(vehicles.router)
api_v1.include_router(users.router)
api_v1.include_router(rules.router)
api_v1.include_router(events.router)
api_v1.include_router(memberships.router)
api_v1.include_router(payments.router)
api_v1.include_router(audit.router)

# WebSocket routes live outside /api/v1 prefix semantics but are mounted at app level.
ws_router = ws.router
