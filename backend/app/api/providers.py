"""
Provider directory search.

This endpoint is a thin, filtered proxy in front of the NPPES NPI Registry.
Two things it deliberately does not do:

* It does not accept a free-text specialty. The client picks one of a fixed
  list of care *settings* (see `provider_directory.CARE_SETTINGS`), so a
  condition name can never be smuggled into a third party's query log.
* It does not report availability, because the directory has none. There is no
  field on the response for a "next available" time, which is the point - an
  absent field cannot be filled in with a plausible guess later by accident.

The proxy exists rather than calling NPPES from the phone so that the app's
own backend, not thousands of devices, is what NPPES sees, and so the care
setting is validated somewhere the client cannot skip.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.appointment import (
    ProviderOut,
    ProviderSearchOut,
    ResolveLocationIn,
    ResolveLocationOut,
)
from app.services.provider_directory import (
    CARE_SETTINGS,
    DEFAULT_CARE_SETTING,
    MAX_RESULTS,
    ProviderDirectoryUnavailable,
    search_providers,
)
from app.services.provider_geo import distances_for
from app.services.request_delivery import delivery_available
from app.services.scheduling_links import link_for
from app.services.zip_geography import nearest_zip

router = APIRouter(prefix="/providers", tags=["providers"])


def _with_scheduling(row: ProviderOut, provider) -> ProviderOut:
    """
    Attach where this provider takes bookings on their own site, if known.

    ⛔ THE ONLY INPUT IS THE PROVIDER'S PUBLISHED NAME. Nothing the user typed
    reaches `link_for` — not the ZIP they searched, not a reason for visit —
    and the URL that comes back is a constant from the registry with nothing
    appended. So this adds no outbound transmission of any kind and raises no
    BAA question; it is a fact about the clinic, printed next to the clinic.

    ⛔ It does not reorder anything. Results are sorted by distance only, and a
    provider that happens to have a booking page must not rise above one that
    does not — that would be MedHelp ranking clinics on a convenience of its
    own, which this file does not do.
    """
    link = link_for(provider.name, is_organization=provider.is_organization)
    if link is None:
        return row
    return row.model_copy(
        update={
            "scheduling_url": link.url,
            "scheduling_system": link.system_name,
            "scheduling_kind": link.kind,
        }
    )


@router.get("/care-settings", response_model=dict[str, str])
def list_care_settings(
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    """The searchable care settings, so the UI does not hard-code the list."""
    return dict(CARE_SETTINGS)


@router.get("/search", response_model=ProviderSearchOut)
def search(
    postal_code: str = Query(..., max_length=10),
    care_setting: str = Query(DEFAULT_CARE_SETTING, max_length=40),
    limit: int = Query(20, ge=1, le=MAX_RESULTS),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProviderSearchOut:
    """
    Providers of one care setting near one ZIP, nearest measurable first.

    The database session is here only for the geocoded-address cache that
    `provider_geo` reads and writes (`provider_locations`). Nothing about the
    caller is stored by this endpoint: that table holds public provider
    addresses and has no user column, so a search leaves no record of who
    searched or what for.
    """
    try:
        providers = search_providers(postal_code, care_setting, limit)
    except ValueError as exc:
        # `search_providers` raises this for a malformed ZIP or an unknown
        # care setting - both are the caller's mistake and safe to echo, as
        # neither can contain health data.
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ProviderDirectoryUnavailable as exc:
        # Same posture as the MedlinePlus path: an outage is reported, never
        # papered over with substitute content.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "The provider directory is unavailable right now. Please try "
                "again in a moment."
            ),
        ) from exc

    # Street-level where the address can be placed, the ZIP-centroid estimate
    # where it cannot, and None rather than a misleading zero. See
    # `provider_geo` for why a zero is the one answer worth suppressing.
    distances = distances_for(providers, postal_code, db)

    # ⛔ ATTACHED AFTER ORDERING, AND ORDERING IS NOT TOUCHED.
    #
    # Results stay sorted by distance only. A provider with a known booking
    # page must not float above one without — that would be MedHelp ranking
    # clinics on a convenience of ours, and this file does not rank providers
    # at all. See the MedlinePlus topic filter for the same rule.
    return ProviderSearchOut(
        providers=[
            _with_scheduling(
                ProviderOut(
                    npi=provider.npi,
                    name=provider.name,
                    specialty=provider.specialty,
                    phone=provider.phone,
                    address=provider.full_address,
                    city=provider.city,
                    state=provider.state,
                    postal_code=provider.postal_code,
                    source_name=provider.source_name,
                    distance_miles=distances.get(provider.npi),
                ),
                provider,
            )
            for provider in providers
        ],
        care_setting=care_setting,
        postal_code=postal_code.strip()[:5],
        online_booking_available=delivery_available(),
    )


@router.post("/resolve-location", response_model=ResolveLocationOut)
def resolve_location(
    payload: ResolveLocationIn,
    user: User = Depends(get_current_user),
) -> ResolveLocationOut:
    """
    Turn a browser coordinate into a ZIP code.

    This exists for the web build. A browser's Geolocation API gives a position
    but no geocoder, so without this step the provider directory - which is
    searched by ZIP - cannot be reached from a coordinate at all. Native builds
    do not call this: iOS and Android have their own on-device geocoder, and
    their coordinates never leave the phone.

    The coordinate arrives as a POST body rather than a query string so it
    stays out of access logs and proxies, is resolved against a local Census
    dataset, and is neither stored nor forwarded. A null `postal_code` means no
    US ZIP is plausibly close, and the client falls back to asking the user to
    type one.
    """
    return ResolveLocationOut(
        postal_code=nearest_zip(payload.latitude, payload.longitude)
    )
