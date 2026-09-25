from email.message import EmailMessage

import aiosmtplib

from app.core.config import get_settings


async def send_email(to: str, subject: str, body_text: str, body_html: str | None = None) -> None:
    s = get_settings()
    msg = EmailMessage()
    msg["From"] = s.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body_text)
    if body_html:
        msg.add_alternative(body_html, subtype="html")
    await aiosmtplib.send(
        msg,
        hostname=s.smtp_host,
        port=s.smtp_port,
        username=s.smtp_username,
        password=s.smtp_password,
        start_tls=s.smtp_starttls,
    )


def invite_email(invite_url: str, tenant_name: str) -> tuple[str, str, str]:
    subject = f"You're invited to {tenant_name} on ParkVision"
    text = (
        f"You have been invited to manage {tenant_name}.\n\n"
        f"Accept the invitation and set your password:\n{invite_url}\n\n"
        "If you did not expect this, ignore this email."
    )
    html = (
        f"<p>You have been invited to manage <b>{tenant_name}</b>.</p>"
        f"<p><a href='{invite_url}'>Accept invitation</a></p>"
    )
    return subject, text, html
