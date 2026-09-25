"""SMTP email sending (Mailpit in dev) + message templates."""

from email.message import EmailMessage

import aiosmtplib

from app.config import get_settings

settings = get_settings()


async def send_email(to: str, subject: str, body: str) -> None:
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


def invite_email(accept_url: str, tenant_name: str | None) -> tuple[str, str]:
    who = f" for {tenant_name}" if tenant_name else ""
    return (
        f"You're invited to ParkVision{who}",
        (
            f"You have been invited to ParkVision{who}.\n\n"
            f"Set your password and activate your account:\n{accept_url}\n\n"
            "This link expires in 7 days.\n"
        ),
    )


def password_reset_email(reset_url: str) -> tuple[str, str]:
    return (
        "ParkVision password reset",
        (
            "A password reset was requested for your ParkVision account.\n\n"
            f"Reset your password:\n{reset_url}\n\n"
            "This link expires in 1 hour. If you did not request this, ignore it.\n"
        ),
    )
