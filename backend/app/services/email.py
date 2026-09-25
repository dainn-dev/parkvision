"""Transactional email via SMTP (Mailpit locally)."""

from email.message import EmailMessage

import aiosmtplib

from app.core.config import get_settings


async def send_email(to: str, subject: str, body: str) -> None:
    settings = get_settings()
    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    await aiosmtplib.send(
        msg,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_username or None,
        password=settings.smtp_password or None,
        start_tls=settings.smtp_tls,
    )


async def send_invite_email(to: str, *, tenant_name: str, invite_url: str) -> None:
    await send_email(
        to,
        f"You're invited to {tenant_name} on ParkVision",
        f"You have been invited to manage vehicle access for {tenant_name}.\n\n"
        f"Accept the invitation and set your password:\n{invite_url}\n\n"
        "If you were not expecting this, ignore this message.",
    )


async def send_password_reset_email(to: str, *, reset_url: str) -> None:
    await send_email(
        to,
        "ParkVision password reset",
        f"A password reset was requested for this account.\n\nReset link:\n{reset_url}\n\n"
        "If you did not request it, ignore this message.",
    )
