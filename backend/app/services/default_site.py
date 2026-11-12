"""A tenant is one site: provision it together with the tenant.

The dashboard's Location page edits the tenant's first site and the edge-device
form requires one, so a tenant without a site cannot register any device.
"""

from app.models import Tenant, TenantSite

# Pricing's overnight window is evaluated in the site's timezone (UTC if unset),
# so a UTC default would silently shift fees for the Vietnamese market.
DEFAULT_SITE_TIMEZONE = "Asia/Ho_Chi_Minh"
SITE_NAME_MAX_LENGTH = 200


def build_default_site(tenant: Tenant) -> TenantSite:
    """Return the site a brand-new tenant starts with, named after the tenant."""
    return TenantSite(
        tenant_id=tenant.id,
        name=tenant.name[:SITE_NAME_MAX_LENGTH],
        timezone=DEFAULT_SITE_TIMEZONE,
        status="active",
    )
