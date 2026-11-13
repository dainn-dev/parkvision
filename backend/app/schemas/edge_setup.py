import ipaddress
import uuid

from pydantic import Field, field_validator

from app.schemas.common import CamelModel
from app.schemas.resources import ActivationCodeOut, DeviceOut, GateOut, SiteOut


class EdgeSetupIn(CamelModel):
    site_id: uuid.UUID | None = None
    device_name: str = Field(min_length=2, max_length=200)
    gate_name: str = Field(min_length=2, max_length=200)
    gate_direction: str = Field(default="entry", min_length=1, max_length=30)
    gate_type: str = Field(default="barrier", min_length=1, max_length=30)
    allowed_ip: str | None = Field(default=None, max_length=64)

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
    gate: GateOut
    activation: EdgeSetupActivationOut
    next_steps: list[str]
