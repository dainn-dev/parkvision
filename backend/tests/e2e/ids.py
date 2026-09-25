"""Resolve seeded IDs dynamically for the E2E harnesses.

Run after `docker compose up -d` + `python -m scripts.seed`. Discovers the demo
tenant's site/gate/device through the platform-admin API and creates a throwaway
foreign tenant + vehicle for the RLS invisibility checks. Import-time resolved:

    from ids import TENANT, SITE, GATE, DEVICE, FOREIGN_TENANT, FOREIGN_VEHICLE
"""

import uuid

import httpx

BASE = "http://localhost:8000"
API = f"{BASE}/api/v1"


def _admin() -> httpx.Client:
    c = httpx.Client(base_url=BASE, timeout=15)
    r = c.post(f"{API}/auth/login", json={"email": "admin@example.com", "password": "ChangeMe!123"})
    r.raise_for_status()
    return c


def _discover() -> tuple[str, str, str, str, str, str]:
    admin = _admin()

    tenants = admin.get(f"{API}/platform/tenants").json()["data"]
    demo = next(t for t in tenants if t["slug"] == "demo")
    tid = demo["id"]

    sites = admin.get(f"{API}/tenants/{tid}/sites").json()["data"]
    gates = admin.get(f"{API}/tenants/{tid}/gates").json()["data"]
    devices = admin.get(f"{API}/tenants/{tid}/devices").json()["data"]
    site_id, gate_id, device_id = sites[0]["id"], gates[0]["id"], devices[0]["id"]

    # Throwaway foreign tenant + one vehicle for the RLS invisibility checks.
    # Platform admins can't write tenant resources, so register a tenant
    # self-service (public endpoint) and act as its owner.
    suffix = uuid.uuid4().hex[:8]
    foreign_email = f"owner-{suffix}@foreign.example.com"
    r = httpx.post(
        f"{API}/register",
        json={
            "tenantName": f"Foreign {suffix}",
            "slug": f"foreign-{suffix}",
            "planCode": "starter",
            "contactEmail": f"ops-{suffix}@foreign.example.com",
            "ownerEmail": foreign_email,
            "ownerFullName": "Foreign Owner",
            "ownerPassword": "ForeignOwner!123",
        },
    )
    r.raise_for_status()
    foreign_tid = r.json()["tenantId"]

    foreign = httpx.Client(base_url=BASE, timeout=15)
    foreign.post(f"{API}/auth/login", json={"email": foreign_email, "password": "ForeignOwner!123"})
    fcsrf = {"X-CSRF-Token": foreign.cookies.get("vm_csrf")}
    r = foreign.post(
        f"{API}/tenants/{foreign_tid}/vehicles",
        json={"plateNumber": "FRGN-1", "ownerName": "Foreign"},
        headers=fcsrf,
    )
    foreign_vid = r.json()["id"]
    return tid, site_id, gate_id, device_id, foreign_tid, foreign_vid


TENANT, SITE, GATE, DEVICE, FOREIGN_TENANT, FOREIGN_VEHICLE = _discover()
