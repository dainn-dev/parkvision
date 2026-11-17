# Edge UI verification checklist (not yet performed)

None of the items below have been run. They need equipment or services unavailable to the implementing agent. Tick an item only after doing it.

## VietQR
- [ ] Generate a walk-in exit quote with a transfer fee, scan the QR in at least two different banking apps. Expected: beneficiary account, bank, amount (equal to the fee) and memo are pre-filled in both. Note the apps tested: ______
- [ ] If any app rejects the QR, compare the payload with the NAPAS 247 spec (current payload is based on a secondary source, see `edge-client/src/lib/vietqr.ts`).

## Printing (80 mm gatehouse printer)
- [ ] Print one phieu vao (entry ticket). Expected: all text/QR visible, nothing cut off at 80 mm.
- [ ] Print one bien lai ra (exit receipt) the same way. Expected: same.
- [ ] Observe whether the OS print dialog appears. If yes, decide on trying `--kiosk-printing` (see docs/edge-client.md section 9.1) and re-test.

## Compose end-to-end (walk-in plan Task 14, step 2)
- [ ] Admit a walk-in vehicle: session opens, entry frame reaches backend.
- [ ] Exit and pay cash: barrier opens once, session closed, amount = fee.
- [ ] Exit and waive: barrier opens, session closed with zero amount.
- [ ] Change the tariff in the dashboard: edge picks it up (`pricing_updated`) without restart; next quote uses the new tariff.
- [ ] Send a correctly signed bank webhook for the exact amount: barrier opens, session closed.
- [ ] Send a short transfer: barrier stays closed, `bankReceivedVnd` recorded, session still open.
- [ ] Dashboard walk-in totals (`/tenant/walk-ins/summary`) match what was collected.

## Layout at 1366x768
- [ ] Two lanes fit with no page scroll.
- [ ] An exit lane with a pending fee shrinks its camera to 160 px; two lanes still fit without page scroll.

## Backend tests (isolated Postgres + Redis, see CLAUDE.md)
- [ ] `cd backend && .venv/bin/python -m pytest` passes.
- [ ] `cd backend && .venv/bin/python -m ruff check app tests scripts` is clean.

## Settings and activation
- [ ] Open settings, change something, save: relay/barrier config of every gate is preserved.
- [ ] Revoke the device (backend) while on the settings screen: app returns to the activation screen.
