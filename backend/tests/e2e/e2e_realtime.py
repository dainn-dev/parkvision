#!/usr/bin/env python3
"""ParkVision E2E — realtime suite (S6 commands+MQTT, S7 plate telemetry, S8 heartbeat, S9 WS)."""

import asyncio
import json
import sys
import time
import uuid

import aiomqtt
import httpx
import websockets

BASE = "http://localhost:8000"
WSBASE = "ws://localhost:8000"
API = f"{BASE}/api/v1"
from ids import DEVICE, FOREIGN_TENANT, GATE, SITE, TENANT  # noqa: E402

TOPIC_CMD = f"tenants/{TENANT}/sites/{SITE}/gates/{GATE}/command"
TOPIC_TEL = f"tenants/{TENANT}/sites/{SITE}/gates/{GATE}/telemetry"

results = []


def check(name, cond, evidence=""):
    results.append((name, bool(cond)))
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" :: {evidence}" if evidence else ""), flush=True)


async def next_msg(queue, timeout=10):
    try:
        return await asyncio.wait_for(queue.get(), timeout)
    except asyncio.TimeoutError:
        return None


async def poll_status(client, cmd_id, want, timeout=100, headers=None):
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = await client.get(f"{API}/tenants/{TENANT}/commands/{cmd_id}")
        if r.status_code == 200 and r.json().get("status") == want:
            return r.json()
        await asyncio.sleep(2)
    r = await client.get(f"{API}/tenants/{TENANT}/commands/{cmd_id}")
    return r.json() if r.status_code == 200 else {"status": f"http{r.status_code}"}


async def main():
    async with httpx.AsyncClient(base_url=BASE, timeout=20) as http:
        r = await http.post(
            f"{API}/auth/login", json={"email": "owner@demo.example.com", "password": "DemoOwner!123"}
        )
        assert r.status_code == 200, r.text
        CSRF = {"X-CSRF-Token": http.cookies.get("vm_csrf")}
        ACCESS = http.cookies.get("vm_access")

        # ---------- S6 command lifecycle ----------
        inbox = asyncio.Queue()
        async with aiomqtt.Client(hostname="localhost", port=1883) as mq:

            async def consume():
                async for m in mq.messages:
                    await inbox.put(m)

            consumer = asyncio.create_task(consume())
            await mq.subscribe(TOPIC_CMD, qos=1)
            await asyncio.sleep(0.5)

            key1 = f"e2e-cmd-open-{uuid.uuid4().hex[:8]}"
            r = await http.post(
                f"{API}/tenants/{TENANT}/gates/{GATE}/commands",
                json={"command": "open", "idempotencyKey": key1},
                headers=CSRF,
            )
            j = r.json()
            cmd_id = j.get("id")
            check(
                "S6a POST command open -> 202 sent/pending",
                r.status_code == 202 and cmd_id and j.get("status") in ("pending", "sent"),
                f"status={r.status_code} cmdId={cmd_id} st={j.get('status')}",
            )

            msg = await next_msg(inbox, 10)
            payload = json.loads(msg.payload) if msg else {}
            check(
                "S6b MQTT delivery on command topic w/ matching commandId+command",
                bool(msg)
                and payload.get("commandId") == cmd_id
                and payload.get("command") == "open"
                and payload.get("gateId") == GATE,
                f"msg={payload if msg else 'NONE'}",
            )

            r = await http.post(
                f"{API}/tenants/{TENANT}/gates/{GATE}/commands",
                json={"command": "open", "idempotencyKey": key1},
                headers=CSRF,
            )
            j2 = r.json()
            check(
                "S6c idempotent replay -> 202 SAME command id",
                r.status_code == 202 and j2.get("id") == cmd_id,
                f"status={r.status_code} replayId={j2.get('id')} origId={cmd_id}",
            )
            dup = await next_msg(inbox, 3)
            check(
                "S6d replay produced NO second MQTT publish",
                dup is None,
                f"extra msg={'NONE' if dup is None else dup.payload}",
            )

            r = await http.post(
                f"{API}/tenants/{TENANT}/gates/{GATE}/commands",
                json={"command": "close", "idempotencyKey": key1},
                headers=CSRF,
            )
            j = r.json()
            check(
                "S6e same key different command -> 409 conflict",
                r.status_code == 409 and j.get("error", {}).get("code") == "conflict",
                f"status={r.status_code} code={j.get('error',{}).get('code')}",
            )

            await mq.publish(
                TOPIC_TEL, json.dumps({"type": "command_ack", "commandId": cmd_id, "success": True}), qos=1
            )
            row = await poll_status(http, cmd_id, "acknowledged", timeout=20)
            check(
                "S6f edge command_ack -> status acknowledged + ackedAt",
                row.get("status") == "acknowledged" and row.get("ackedAt"),
                f"status={row.get('status')} ackedAt={row.get('ackedAt')}",
            )

            key2 = f"e2e-cmd-lock-{uuid.uuid4().hex[:8]}"
            r = await http.post(
                f"{API}/tenants/{TENANT}/gates/{GATE}/commands",
                json={"command": "lock", "idempotencyKey": key2},
                headers=CSRF,
            )
            cmd2 = r.json().get("id")
            check(
                "S6g second command (lock) issued -> 202",
                r.status_code == 202 and bool(cmd2),
                f"status={r.status_code} id={cmd2}",
            )
            # drain the MQTT echo for command 2 so it doesn't confuse later checks
            await next_msg(inbox, 8)

            # ---------- S7 plate telemetry -> decision engine ----------
            async def latest_event(plate, timeout=15):
                dl = time.time() + timeout
                while time.time() < dl:
                    r = await http.get(
                        f"{API}/tenants/{TENANT}/access-events", params={"plate": plate, "limit": 1}
                    )
                    rows = r.json().get("data", [])
                    if rows:
                        return rows[0]
                    await asyncio.sleep(1)
                return None

            await mq.publish(
                TOPIC_TEL,
                json.dumps({"plateNumber": "30A-12345", "direction": "entry", "confidence": 0.97}),
                qos=1,
            )
            ev = await latest_event("30A-12345")
            check(
                "S7a plate 30A-12345 (staff) -> allow/vehicle_registered",
                ev and ev.get("decision") == "allow" and ev.get("reason") == "vehicle_registered",
                f"dec={ev and ev.get('decision')} reason={ev and ev.get('reason')}",
            )

            await mq.publish(
                TOPIC_TEL,
                json.dumps({"plateNumber": "99Z-00001", "direction": "entry", "confidence": 0.95}),
                qos=1,
            )
            ev = await latest_event("99Z-00001")
            check(
                "S7b plate 99Z-00001 (blacklist) -> deny/vehicle_blacklisted",
                ev and ev.get("decision") == "deny" and ev.get("reason") == "vehicle_blacklisted",
                f"dec={ev and ev.get('decision')} reason={ev and ev.get('reason')}",
            )

            await mq.publish(
                TOPIC_TEL,
                json.dumps({"plateNumber": "ZZ-NOPE-9", "direction": "entry", "confidence": 0.88}),
                qos=1,
            )
            ev = await latest_event("ZZ-NOPE-9")
            check(
                "S7c unknown plate -> deny/plate_not_registered",
                ev and ev.get("decision") == "deny" and ev.get("reason") == "plate_not_registered",
                f"dec={ev and ev.get('decision')} reason={ev and ev.get('reason')}",
            )

            # ---------- S8 heartbeat -> device online ----------
            before = await http.get(f"{API}/tenants/{TENANT}/devices/{DEVICE}")
            await mq.publish(TOPIC_TEL, json.dumps({"type": "heartbeat", "deviceId": DEVICE}), qos=1)
            dev = None
            dl = time.time() + 20
            while time.time() < dl:
                r = await http.get(f"{API}/tenants/{TENANT}/devices/{DEVICE}")
                d = r.json()
                if (
                    d.get("lastHeartbeatAt")
                    and d.get("status") == "online"
                    and d["lastHeartbeatAt"] != (before.json().get("lastHeartbeatAt") or "x")
                ):
                    dev = d
                    break
                await asyncio.sleep(1)
            check(
                "S8 heartbeat -> device online + fresh lastHeartbeatAt",
                bool(dev),
                f"status={dev and dev.get('status')} hb={dev and dev.get('lastHeartbeatAt')}",
            )

            # ---------- S9 WS fan-out + auth ----------
            url = f"{WSBASE}/ws/tenants/{TENANT}/barrier-telemetry?token={ACCESS}"
            try:
                async with websockets.connect(url) as ws:
                    await mq.publish(
                        TOPIC_TEL, json.dumps({"plateNumber": "WS-CHK-11", "direction": "entry"}), qos=1
                    )
                    try:
                        frame = await asyncio.wait_for(ws.recv(), 15)
                        fj = json.loads(frame)
                        check(
                            "S9a WS receives telemetry fan-out w/ published plate",
                            fj.get("type") == "telemetry" and fj.get("plateNumber") == "WS-CHK-11",
                            f"frame={frame[:160]}",
                        )
                    except asyncio.TimeoutError:
                        check("S9a WS receives telemetry fan-out", False, "no frame in 15s")
            except Exception as e:
                check("S9a WS connect+fan-out", False, f"{type(e).__name__}: {e}")

            try:
                async with websockets.connect(
                    f"{WSBASE}/ws/tenants/{FOREIGN_TENANT}/barrier-telemetry?token={ACCESS}"
                ) as ws:
                    await ws.recv()
                check("S9b WS foreign tenant -> close 4403", False, "connection stayed open")
            except websockets.exceptions.ConnectionClosedError as e:
                check("S9b WS foreign tenant -> close 4403", e.code == 4403, f"code={e.code}")
            except Exception as e:
                check("S9b WS foreign tenant -> close 4403", False, f"{type(e).__name__}: {e}")

            try:
                async with websockets.connect(f"{WSBASE}/ws/tenants/{TENANT}/barrier-telemetry") as ws:
                    await ws.recv()
                check("S9c WS no token -> close 4401", False, "connection stayed open")
            except websockets.exceptions.ConnectionClosedError as e:
                check("S9c WS no token -> close 4401", e.code == 4401, f"code={e.code}")
            except Exception as e:
                check("S9c WS no token -> close 4401", False, f"{type(e).__name__}: {e}")

            # ---------- S6h timeout path (unacked command -> timeout) ----------
            row = await poll_status(http, cmd2, "timeout", timeout=95)
            check(
                "S6h unacked command -> status timeout (worker sweep)",
                row.get("status") == "timeout",
                f"status={row.get('status')} requestedAt={row.get('requestedAt')} timeoutAt={row.get('timeoutAt')}",
            )

            consumer.cancel()

    print("\n==== SUMMARY ====")
    fails = [n for n, ok in results if not ok]
    print(
        f"{len(results) - len(fails)}/{len(results)} passed"
        + (f"; FAILURES: {fails}" if fails else " — all green")
    )
    sys.exit(1 if fails else 0)


asyncio.run(main())
