"""Payment gateway adapters.

`get_gateway` maps `settings.payment_provider` to an adapter; 'none' (or an
unconfigured provider) yields None so callers can return a 503
`payments_not_configured` instead of pretending a payment succeeded.

MoMo v2 "payWithMethod" flow: POST /create → `payUrl` (driver pays in the
MoMo app/webview) → IPN POST to our callback + optional pull via /query.
All three calls are HMAC-SHA256 signed with `momo_secret_key`. The default
endpoint is the MoMo sandbox (test-payment.momo.vn); production swaps the
endpoint + credentials via env only.
"""

import hashlib
import hmac
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from app.config import settings


@dataclass
class GatewayPaymentInit:
    pay_url: str | None


class PaymentGateway(Protocol):
    name: str

    async def create_payment(
        self,
        *,
        amount_vnd: int,
        order_id: str,
        order_info: str,
        request_id: str,
        redirect_url: str,
        ipn_url: str,
    ) -> GatewayPaymentInit: ...

    def verify_signature(self, payload: dict[str, Any]) -> bool: ...

    def ipn_succeeded(self, payload: dict[str, Any]) -> bool: ...

    async def query_status(
        self, *, order_id: str, request_id: str
    ) -> str: ...  # 'paid' | 'failed' | 'pending'


class MomoGateway:
    """MoMo v2 gateway adapter (sandbox-safe; signature-verified)."""

    name = "momo"

    def __init__(
        self,
        *,
        partner_code: str,
        access_key: str,
        secret_key: str,
        endpoint: str,
    ) -> None:
        self._partner = partner_code
        self._access = access_key
        self._secret = secret_key
        self._endpoint = endpoint.rstrip("/")

    def _sign(self, raw: str) -> str:
        return hmac.new(self._secret.encode(), raw.encode(), hashlib.sha256).hexdigest()

    async def create_payment(
        self,
        *,
        amount_vnd: int,
        order_id: str,
        order_info: str,
        request_id: str,
        redirect_url: str,
        ipn_url: str,
    ) -> GatewayPaymentInit:
        request_type = "payWithMethod"
        extra_data = ""
        raw = (
            f"accessKey={self._access}&amount={amount_vnd}&extraData={extra_data}"
            f"&ipnUrl={ipn_url}&orderId={order_id}&orderInfo={order_info}"
            f"&partnerCode={self._partner}&redirectUrl={redirect_url}"
            f"&requestId={request_id}&requestType={request_type}"
        )
        body = {
            "partnerCode": self._partner,
            "accessKey": self._access,
            "requestId": request_id,
            "amount": str(amount_vnd),
            "orderId": order_id,
            "orderInfo": order_info,
            "redirectUrl": redirect_url,
            "ipnUrl": ipn_url,
            "requestType": request_type,
            "extraData": extra_data,
            "lang": "vi",
            "signature": self._sign(raw),
        }
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(f"{self._endpoint}/create", json=body)
            resp.raise_for_status()
            data = resp.json()
        # resultCode 0 = accepted; anything else is a provider-side reject
        # (the payment row is marked failed by the caller).
        if int(data.get("resultCode", -1)) != 0:
            raise MomoRejected(
                int(data.get("resultCode", -1)), str(data.get("message", "MoMo rejected"))
            )
        return GatewayPaymentInit(pay_url=data.get("payUrl"))

    def verify_signature(self, payload: dict[str, Any]) -> bool:
        signature = str(payload.get("signature", ""))
        raw = (
            f"accessKey={self._access}"
            f"&amount={payload.get('amount', '')}"
            f"&extraData={payload.get('extraData', '')}"
            f"&message={payload.get('message', '')}"
            f"&orderId={payload.get('orderId', '')}"
            f"&orderInfo={payload.get('orderInfo', '')}"
            f"&orderType={payload.get('orderType', '')}"
            f"&partnerCode={payload.get('partnerCode', '')}"
            f"&payType={payload.get('payType', '')}"
            f"&requestId={payload.get('requestId', '')}"
            f"&responseTime={payload.get('responseTime', '')}"
            f"&resultCode={payload.get('resultCode', '')}"
            f"&transId={payload.get('transId', '')}"
        )
        return hmac.compare_digest(self._sign(raw), signature)

    def ipn_succeeded(self, payload: dict[str, Any]) -> bool:
        return int(payload.get("resultCode", -1)) == 0

    async def query_status(self, *, order_id: str, request_id: str) -> str:
        raw = (
            f"accessKey={self._access}&orderId={order_id}"
            f"&partnerCode={self._partner}&requestId={request_id}"
        )
        body = {
            "partnerCode": self._partner,
            "requestId": request_id,
            "orderId": order_id,
            "lang": "vi",
            "signature": self._sign(raw),
        }
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(f"{self._endpoint}/query", json=body)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPError:
            return "pending"
        code = int(data.get("resultCode", -1))
        if code == 0:
            return "paid"
        # 1000 = in-flight/unknown order on MoMo's side
        return "pending" if code == 1000 else "failed"


class MomoRejected(Exception):
    """Provider rejected the create call (bad order id, limits, etc.)."""

    def __init__(self, result_code: int, message: str) -> None:
        self.result_code = result_code
        super().__init__(message)


def get_gateway() -> PaymentGateway | None:
    """Configured gateway for the current env; None when payments are off."""
    if settings.payment_provider == "momo":
        if not (settings.momo_partner_code and settings.momo_access_key and settings.momo_secret_key):
            return None
        return MomoGateway(
            partner_code=settings.momo_partner_code,
            access_key=settings.momo_access_key,
            secret_key=settings.momo_secret_key,
            endpoint=settings.momo_endpoint,
        )
    return None
