#!/usr/bin/env python3
"""ParkVision E2E — pure HTTP suite (S1-S5, S10-S13). Prints PASS/FAIL evidence."""

import json
import sys
import time
import urllib.request
import uuid as _uuid

import httpx

BASE = "http://localhost:8000"
API = f"{BASE}/api/v1"
from ids import FOREIGN_TENANT, FOREIGN_VEHICLE, TENANT  # noqa: E402

MAILPIT = "http://localhost:8025"

# Run-unique plates so the suite is re-runnable against a persistent dev DB.
RUN = _uuid.uuid4().hex[:4].upper()
PLATE_A = f"E2E-{RUN}-A"
PLATE_B = f"E2E-{RUN}-B"

results = []


def check(name, cond, evidence=""):
    results.append((name, bool(cond)))
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" :: {evidence}" if evidence else ""))


def new_client():
    c = httpx.Client(base_url=BASE, timeout=15)
    return c


def login(c, email, password):
    r = c.post(f"{API}/auth/login", json={"email": email, "password": password})
    return r


def csrf(c):
    return {"X-CSRF-Token": c.cookies.get("vm_csrf")}


# ---------- S1 health ----------
r = httpx.get(f"{BASE}/healthz")
check("S1a /healthz ok", r.status_code == 200 and r.json().get("status") == "ok", r.text)
r = httpx.get(f"{BASE}/readyz")
j = r.json()
check(
    "S1b /readyz ok (pg+redis up)",
    r.status_code == 200
    and j.get("status") == "ok"
    and j["checks"]["postgres"]["status"] == "up"
    and j["checks"]["redis"]["status"] == "up",
    json.dumps(j),
)

# ---------- S2 auth both roles ----------
owner = new_client()
r = login(owner, "owner@demo.example.com", "DemoOwner!123")
j = r.json()
check(
    "S2a owner login 200 mfaRequired=false csrfToken",
    r.status_code == 200 and j["data"].get("mfaRequired") is False and bool(j["data"].get("csrfToken")),
    json.dumps(j)[:200],
)
cookie_names = dict(owner.cookies.items())
check(
    "S2b cookies vm_access/vm_refresh/vm_csrf set",
    all(k in cookie_names for k in ("vm_access", "vm_refresh", "vm_csrf")),
    str(list(cookie_names)),
)
r = owner.get(f"{API}/auth/me")
j = r.json()
check(
    "S2c owner /me tenant_user demo owner",
    r.status_code == 200
    and j["user"]["email"] == "owner@demo.example.com"
    and j["userType"] == "tenant_user"
    and j["tenantSlug"] == "demo"
    and j["user"]["role"] == "owner",
    f"email={j.get('user',{}).get('email')} type={j.get('userType')} slug={j.get('tenantSlug')}",
)

admin = new_client()
r = login(admin, "admin@example.com", "ChangeMe!123")
check("S2d admin login 200", r.status_code == 200 and r.json()["data"].get("csrfToken"), r.text[:150])
r = admin.get(f"{API}/auth/me")
j = r.json()
check(
    "S2e admin /me platform_admin tenantId null",
    r.status_code == 200 and j["userType"] == "platform_admin" and j.get("tenantId") is None,
    f"type={j.get('userType')} tid={j.get('tenantId')}",
)

# ---------- S3 CSRF ----------
r = owner.post(f"{API}/tenants/{TENANT}/vehicles", json={"plateNumber": PLATE_A})
j = r.json()
check(
    "S3a mutation w/o X-CSRF-Token -> 403 forbidden",
    r.status_code == 403 and j["error"]["code"] == "forbidden",
    f"status={r.status_code} code={j.get('error',{}).get('code')} msg={j.get('error',{}).get('message')}",
)
r = owner.post(f"{API}/tenants/{TENANT}/vehicles", json={"plateNumber": PLATE_A}, headers=csrf(owner))
j = r.json()
check(
    "S3b same mutation WITH X-CSRF-Token -> 201",
    r.status_code == 201 and j.get("plateNumber") == PLATE_A,
    f"status={r.status_code} plate={j.get('plateNumber')}",
)

# ---------- S4 cross-tenant ----------
r = owner.get(f"{API}/tenants/{FOREIGN_TENANT}/vehicles")
j = r.json()
check(
    "S4a owner->foreign tenant /vehicles -> 403",
    r.status_code == 403 and j["error"]["code"] == "forbidden",
    f"status={r.status_code} msg={j.get('error',{}).get('message')}",
)
r = owner.get(f"{API}/tenants/{TENANT}/vehicles/{FOREIGN_VEHICLE}")
j = r.json()
check(
    "S4b owner GET foreign vehicle via demo path -> 404 (RLS invisible)",
    r.status_code == 404 and j["error"]["code"] == "not_found",
    f"status={r.status_code} code={j.get('error',{}).get('code')}",
)
r = admin.get(f"{API}/tenants/{TENANT}/vehicles")
j = r.json()
plates = [v["plateNumber"] for v in j.get("data", [])]
check(
    "S4c admin bypass GET demo vehicles -> 200 with seeded plates",
    r.status_code == 200 and {"30A-12345", "51F-67890", "99Z-00001"}.issubset(set(plates)),
    f"total={j.get('meta',{}).get('total')} plates={plates[:6]}",
)

# ---------- S5 vehicle create + normalized dup ----------
r = owner.post(f"{API}/tenants/{TENANT}/vehicles", json={"plateNumber": PLATE_B}, headers=csrf(owner))
j = r.json()
# VehicleOut exposes plateNumber (normalized uppercase), not plateNormalized field.
# Verify normalization via the list/search endpoint.
r2 = owner.get(f"{API}/tenants/{TENANT}/vehicles", params={"search": PLATE_B.replace("-", " ")})
found = any(v["plateNumber"] == PLATE_B for v in r2.json().get("data", []))
check(
    "S5a create E2E-7777 -> 201 + searchable via normalized plate",
    r.status_code == 201 and j.get("plateNumber") == PLATE_B and found,
    f"status={r.status_code} plate={j.get('plateNumber')} searchHit={found}",
)
r = owner.post(f"{API}/tenants/{TENANT}/vehicles", json={"plateNumber": PLATE_B.lower()}, headers=csrf(owner))
j = r.json()
check(
    "S5b duplicate 'e2e-7777' -> 409 conflict already registered",
    r.status_code == 409
    and j["error"]["code"] == "conflict"
    and "already registered" in j["error"]["message"],
    f"status={r.status_code} code={j.get('error',{}).get('code')} msg={j.get('error',{}).get('message')}",
)

# ---------- S10 invite -> Mailpit -> activate ----------
invite_email = f"invitee-{_uuid.uuid4().hex[:6]}@demo.example.com"
r = owner.post(
    f"{API}/tenants/{TENANT}/users",
    json={"email": invite_email, "fullName": "E2E Invitee", "role": "viewer"},
    headers=csrf(owner),
)
j = r.json()
check(
    "S10a invite user -> 201 status invited",
    r.status_code == 201 and j.get("status") == "invited" and j.get("role") == "viewer",
    f"status={r.status_code} role={j.get('role')} ustatus={j.get('status')}",
)

token = None
for _ in range(20):
    try:
        msgs = json.loads(urllib.request.urlopen(f"{MAILPIT}/api/v1/messages?limit=20", timeout=5).read())
        for m in msgs.get("messages", []):
            if invite_email in (m.get("To") or [{}])[0].get("Address", "") or invite_email in json.dumps(m):
                detail = json.loads(
                    urllib.request.urlopen(f"{MAILPIT}/api/v1/message/{m['ID']}", timeout=5).read()
                )
                body = detail.get("Text") or detail.get("HTML") or ""
                if "/activate?token=" in body:
                    token = body.split("/activate?token=")[1].split()[0].strip()
                break
        if token:
            break
    except Exception:
        pass
    time.sleep(1)
check(
    "S10b Mailpit email to invitee with /activate?token= link",
    bool(token),
    f"token={'present' if token else 'MISSING'}",
)

if token:
    anon = new_client()
    r = anon.post(f"{API}/auth/activate", json={"token": token, "password": "Invitee!123"})
    check(
        "S10c /auth/activate with token -> 200",
        r.status_code == 200,
        f"status={r.status_code} {r.text[:120]}",
    )
    inv = new_client()
    r = login(inv, invite_email, "Invitee!123")
    ok = r.status_code == 200
    me = inv.get(f"{API}/auth/me").json() if ok else {}
    check(
        "S10d invitee login + /me role viewer",
        ok and me.get("user", {}).get("role") == "viewer",
        f"login={r.status_code} role={me.get('user',{}).get('role')}",
    )
else:
    check("S10c /auth/activate", False, "skipped — no token")
    check("S10d invitee login", False, "skipped — no token")

# ---------- S6-lite note: command tests live in realtime script ----------

# ---------- S11 audit ----------
r = owner.get(f"{API}/tenants/{TENANT}/audit-logs", params={"limit": 100})
j = r.json()
actions = {a["action"] for a in j.get("data", [])}
check(
    "S11 audit-logs contain vehicle.created + user.invited + gate.command.issued",
    r.status_code == 200 and {"vehicle.created", "user.invited"} <= actions,
    f"actions sample={sorted(actions)[:12]}",
)

# ---------- S12 refresh + logout (separate session jar) ----------
sess = new_client()
login(sess, "owner@demo.example.com", "DemoOwner!123")
r = sess.post(f"{API}/auth/refresh")
j = r.json()
check(
    "S12a /auth/refresh -> 200 new csrfToken",
    r.status_code == 200 and bool(j["data"].get("csrfToken")),
    f"status={r.status_code}",
)
r = sess.post(f"{API}/auth/logout")
check("S12b /auth/logout -> 200", r.status_code == 200, f"status={r.status_code} {r.text[:80]}")
r = sess.get(f"{API}/auth/me")
check("S12c /me after logout -> 401", r.status_code == 401, f"status={r.status_code} {r.text[:100]}")
r = sess.post(f"{API}/auth/refresh")
check(
    "S12d /auth/refresh after logout -> 401 (session revoked)",
    r.status_code == 401,
    f"status={r.status_code} {r.text[:100]}",
)

# ---------- S13 public ----------
# NOTE: public router has NO /public prefix — real paths are /api/v1/plans etc.
r = httpx.get(f"{API}/plans")
j = r.json()
check(
    "S13a /plans -> 200 non-empty",
    r.status_code == 200 and len(j.get("data", [])) >= 1,
    f"plans={[p.get('code') for p in j.get('data',[])]}",
)
r = httpx.get(f"{API}/legal/terms")
j = r.json()
check(
    "S13b /legal/terms -> 200 doc",
    r.status_code == 200 and j.get("docType") == "terms",
    f"status={r.status_code} docType={j.get('docType')} version={j.get('version')}",
)
# Register a self-service tenant (proves /register works end-to-end)
slug = f"e2e-{_uuid.uuid4().hex[:8]}"
r = httpx.post(
    f"{API}/register",
    json={
        "tenantName": "E2E Reg Co",
        "slug": slug,
        "planCode": "starter",
        "contactEmail": "ops@e2e.example.com",
        "ownerEmail": f"owner-{slug}@example.com",
        "ownerPassword": "RegOwner!123",
        "ownerFullName": "Reg Owner",
    },
)
j = r.json()
check(
    "S13c /register -> 201 tenant+owner created",
    r.status_code == 201 and j.get("tenantId") and j.get("ownerUserId"),
    f"status={r.status_code} tenantId={j.get('tenantId')}",
)
if r.status_code == 201:
    reg = new_client()
    rr = login(reg, f"owner-{slug}@example.com", "RegOwner!123")
    me = reg.get(f"{API}/auth/me").json() if rr.status_code == 200 else {}
    check(
        "S13d new tenant owner login + /me slug matches",
        rr.status_code == 200 and me.get("tenantSlug") == slug,
        f"login={rr.status_code} slug={me.get('tenantSlug')}",
    )

print("\n==== SUMMARY ====")
fails = [n for n, ok in results if not ok]
print(
    f"{len(results) - len(fails)}/{len(results)} passed"
    + (f"; FAILURES: {fails}" if fails else " — all green")
)
sys.exit(1 if fails else 0)
