"""Bank notification adapters for walk-in VietQR payments.

The first adapter uses a shared HMAC secret because the bank/provider is not
selected yet. The adapter boundary lets a provider-specific signature parser
replace it without changing walk-in settlement logic.
"""

from app.services.walk_in_service import (
    BankNotifyAdapter,
    BankTransfer,
    SharedSecretAdapter,
    get_bank_adapter,
)

__all__ = ["BankNotifyAdapter", "BankTransfer", "SharedSecretAdapter", "get_bank_adapter"]
