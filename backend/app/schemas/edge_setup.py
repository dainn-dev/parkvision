import ipaddress
import uuid
from typing import Literal

from pydantic import Field, field_validator

from app.schemas.common import CamelModel
from app.schemas.resources import ActivationCodeOut, DeviceOut, GateOut, SiteOut


class EdgeSetupGateIn(CamelModel):
    name: str = Field(min_length=2, max_length=200)
    direction: Literal["entry", "exit"] = "entry"
    gate_type: Literal["barrier"] = "barrier"


class EdgeSetupIn(CamelModel):
    site_id: uuid.UUID | None = None
    device_name: str = Field(min_length=2, max_length=200)
    gates: list[EdgeSetupGateIn] | None = Field(default=None, min_length=1, max_length=8)
    # Backward-compatible single-gate request fields.
    gate_name: str | None = Field(default=None, min_length=2, max_length=200)
    gate_direction: Literal["entry", "exit"] = "entry"
    gate_type: Literal["barrier"] = "barrier"
    allowed_ip: str | None = Field(default=None, max_length=64)

    @property
    def normalized_gates(self) -> list[EdgeSetupGateIn]:
        if self.gates is not None:
            return self.gates
        if self.gate_name is None:
            raise ValueError("gateName or gates is required")
        return [
            EdgeSetupGateIn(
                name=self.gate_name,
                direction=self.gate_direction,
                gate_type=self.gate_type,
            )
        ]

    @field_validator("allowed_ip")
    @classmethod
    def valid_ip_or_cidr(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        try:
            ipaddress.ip_network(value.strip(), strict=False)
        except ValueError:
            raise ValueError("allowedIp must be an IP address or CIDR range") from None
        return value.strip()


class EdgeSetupActivationOut(ActivationCodeOut):
    allowed_ip: str | None = None


class EdgeSetupOut(CamelModel):
    site: SiteOut
    device: DeviceOut
    gates: list[GateOut]
    # Kept for clients of the original single-gate response.
    gate: GateOut
    activation: EdgeSetupActivationOut
    next_steps: list[str]
