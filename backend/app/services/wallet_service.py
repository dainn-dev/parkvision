"""Driver wallet: VND balance + append-only ledger.

The wallet is funded by kind='topup' payments (gateway-verified) and
spent by method='wallet' membership/session payments. Every mutation
goes through `credit`/`debit`, which SELECT FOR UPDATE the wallet row
and write a `wallet_transactions` entry carrying the resulting balance —
the ledger is the audit trail; the wallet row is just the cache.

Refunds mirror spend: a refunded wallet payment writes `refund_credit`;
a refunded topup writes `refund_debit` and is refused when the balance
can no longer cover the clawback (the driver already spent the credit).
"""

import uuid

from sqlalchemy import select

from app.core.errors import conflict, not_found
from app.models import DriverWallet, WalletTransaction

#: credit | debit | refund_credit | refund_debit
TXN_KINDS = ("topup_credit", "spend_debit", "refund_credit", "refund_debit")


async def get_or_create_wallet(db, driver_id: uuid.UUID) -> DriverWallet:
    w = (
        await db.execute(
            select(DriverWallet)
            .where(DriverWallet.driver_id == driver_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if w is None:
        # Possible unique-violation under concurrency — the caller's
        # transaction is short and payments serialize per driver anyway.
        w = DriverWallet(driver_id=driver_id, balance_vnd=0)
        db.add(w)
        await db.flush()
    return w


async def _apply(
    db, wallet: DriverWallet, delta: int, kind: str, payment_id, note: str
) -> WalletTransaction:
    new_balance = wallet.balance_vnd + delta
    if new_balance < 0:
        raise conflict("Insufficient wallet balance") from None
    wallet.balance_vnd = new_balance
    txn = WalletTransaction(
        wallet_id=wallet.id,
        kind=kind,
        amount_vnd=abs(delta),
        balance_after_vnd=new_balance,
        payment_id=payment_id,
        note=note[:255],
    )
    db.add(txn)
    await db.flush()
    return txn


async def credit(db, driver_id, amount: int, kind: str, payment_id=None, note: str = ""):
    w = await get_or_create_wallet(db, driver_id)
    return await _apply(db, w, amount, kind, payment_id, note)


async def debit(db, driver_id, amount: int, kind: str, payment_id=None, note: str = ""):
    w = await get_or_create_wallet(db, driver_id)
    return await _apply(db, w, -amount, kind, payment_id, note)


def _txn_out(t: WalletTransaction) -> dict:
    return {
        "id": t.id,
        "kind": t.kind,
        "amount_vnd": t.amount_vnd,
        "balance_after_vnd": t.balance_after_vnd,
        "payment_id": t.payment_id,
        "note": t.note,
        "created_at": t.created_at,
    }


async def wallet_out(db, driver_id: uuid.UUID, txn_limit: int = 20) -> dict:
    w = (
        await db.execute(
            select(DriverWallet).where(DriverWallet.driver_id == driver_id)
        )
    ).scalar_one_or_none()
    if w is None:
        return {"balance_vnd": 0, "transactions": []}
    txns = (
        (
            await db.execute(
                select(WalletTransaction)
                .where(WalletTransaction.wallet_id == w.id)
                .order_by(WalletTransaction.created_at.desc())
                .limit(txn_limit)
            )
        )
        .scalars()
        .all()
    )
    return {"balance_vnd": w.balance_vnd, "transactions": [_txn_out(t) for t in txns]}


async def get_wallet_for_driver(db, driver_id: uuid.UUID) -> DriverWallet:
    w = (
        await db.execute(
            select(DriverWallet).where(DriverWallet.driver_id == driver_id)
        )
    ).scalar_one_or_none()
    if w is None:
        raise not_found("wallet")
    return w
