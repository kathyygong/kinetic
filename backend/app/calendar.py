"""Read-only Google Calendar integration for Kinetic.

Provides:
  - get_mock_events_for_day(): fetches today's events from the user's primary
        Google Calendar (name kept for interface compatibility; data is real)
  - calculate_available_minutes(events): largest continuous free block
        within the 6am-10pm window
  - get_available_minutes(): convenience wrapper used by the rest of the app

OAuth setup
-----------
1. Create an OAuth 2.0 Client ID (type "Desktop app") in Google Cloud Console
   for a project that has the Google Calendar API enabled.
2. Download the client secret JSON and save it as ``backend/credentials.json``
   (path can be overridden with the ``KINETIC_GCAL_CREDENTIALS`` env var).
3. The first call will open a browser to authorize read-only access; the
   refresh token is then cached in ``backend/token.json`` for reuse.

Both ``credentials.json`` and ``token.json`` are secrets and should be
git-ignored.
"""

from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import List, TypedDict
import os

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build


# Day window: 6:00am - 10:00pm
DAY_START = time(6, 0)
DAY_END = time(22, 0)

# Read-only access — we never write to the user's calendar.
SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]

# Default file locations (overridable via env vars for tests / deployments).
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_CREDENTIALS_PATH = Path(
    os.environ.get("KINETIC_GCAL_CREDENTIALS", _BACKEND_DIR / "credentials.json")
)
_TOKEN_PATH = Path(
    os.environ.get("KINETIC_GCAL_TOKEN", _BACKEND_DIR / "token.json")
)


class Event(TypedDict):
    """A simple calendar event."""
    start: datetime
    end: datetime


def get_mock_events_for_day() -> List[Event]:
    """Return today's events from the user's primary Google Calendar.

    The legacy ``get_mock_events_for_day`` name is retained so existing callers
    keep working; the data is now sourced live from Google Calendar.

    All-day events are skipped (they have no time window to plan around).
    Returned datetimes are naive local time, matching the rest of the engine.
    """
    creds = _get_credentials()
    service = build("calendar", "v3", credentials=creds, cache_discovery=False)

    today = date.today()
    # Use a wide window covering the entire local day, then send as RFC3339.
    day_start_local = datetime.combine(today, time.min).astimezone()
    day_end_local = day_start_local + timedelta(days=1)

    response = (
        service.events()
        .list(
            calendarId="primary",
            timeMin=day_start_local.isoformat(),
            timeMax=day_end_local.isoformat(),
            singleEvents=True,  # expand recurring events
            orderBy="startTime",
        )
        .execute()
    )

    events: List[Event] = []
    for item in response.get("items", []):
        start_raw = item.get("start", {}).get("dateTime")
        end_raw = item.get("end", {}).get("dateTime")
        # Skip all-day events (those use "date" instead of "dateTime").
        if not start_raw or not end_raw:
            continue
        events.append(
            {
                "start": _to_naive_local(start_raw),
                "end": _to_naive_local(end_raw),
            }
        )

    return events


def calculate_available_minutes(events: List[Event]) -> int:
    """Largest continuous free block (in minutes) within the 6am-10pm window.

    - Events are clipped to the day window.
    - Overlapping events are merged so they aren't double-counted.
    - The return value is the size of the single longest gap, not the
      total free time.
    """
    if not events:
        return _minutes_between(DAY_START, DAY_END)

    # Anchor everything to the date of the first event so we can compare
    # `time` objects via full datetimes.
    day = events[0]["start"].date()
    day_start = datetime.combine(day, DAY_START)
    day_end = datetime.combine(day, DAY_END)

    # Clip events to the day window and drop anything that ends up empty.
    clipped: List[tuple[datetime, datetime]] = []
    for ev in events:
        s = max(ev["start"], day_start)
        e = min(ev["end"], day_end)
        if e > s:
            clipped.append((s, e))

    if not clipped:
        return _minutes_between(DAY_START, DAY_END)

    # Merge overlapping intervals.
    clipped.sort()
    merged: List[tuple[datetime, datetime]] = [clipped[0]]
    for s, e in clipped[1:]:
        last_s, last_e = merged[-1]
        if s <= last_e:
            merged[-1] = (last_s, max(last_e, e))
        else:
            merged.append((s, e))

    # Walk the gaps between merged events (plus the edges of the day).
    largest = 0
    cursor = day_start
    for s, e in merged:
        gap = int((s - cursor).total_seconds() // 60)
        if gap > largest:
            largest = gap
        cursor = e
    # Trailing gap from last event to end of day.
    tail = int((day_end - cursor).total_seconds() // 60)
    if tail > largest:
        largest = tail

    return max(0, largest)


def get_available_minutes() -> int:
    """Compose the two helpers above and return today's free minutes."""
    return calculate_available_minutes(get_mock_events_for_day())


# --- Multi-day availability + travel detection ------------------------------

# Frontend uses "Mon"-"Sun" labels; align with Python's weekday() index.
_DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

# Heuristics for spotting travel events. We match on title keywords; for an
# initial pass that's robust to most user habits ("Flight to NYC", "Trip to
# Boston", "Travel day"). All-day events (no dateTime) are also treated as
# travel candidates when the title contains one of these keywords.
_TRAVEL_KEYWORDS = (
    "flight",
    "fly to",
    "trip to",
    "travel to",
    "travel day",
    "vacation",
    "out of town",
    "ooo",
    "business trip",
    "conference",
    "offsite",
    "off-site",
)


def get_week_availability(
    start: date | None = None,
    days: int = 7,
) -> List[dict]:
    """Return per-day available minutes for the next `days` days.

    Each entry is ``{"date": "YYYY-MM-DD", "day": "Mon", "minutes": int}``.
    Day labels are stable across timezones; minutes is the longest free
    block in the 6am-10pm window.
    """
    base = start or date.today()
    creds = _get_credentials()
    service = build("calendar", "v3", credentials=creds, cache_discovery=False)

    # Fetch all events for the window in one call, then bucket by day.
    window_start = datetime.combine(base, time.min).astimezone()
    window_end = window_start + timedelta(days=days)

    response = (
        service.events()
        .list(
            calendarId="primary",
            timeMin=window_start.isoformat(),
            timeMax=window_end.isoformat(),
            singleEvents=True,
            orderBy="startTime",
        )
        .execute()
    )

    # Bucket timed events by local date.
    buckets: dict[date, List[Event]] = {}
    for item in response.get("items", []):
        start_raw = item.get("start", {}).get("dateTime")
        end_raw = item.get("end", {}).get("dateTime")
        if not start_raw or not end_raw:
            continue
        s = _to_naive_local(start_raw)
        e = _to_naive_local(end_raw)
        # Split events that cross midnight so each impacted day has its
        # own clipped chunk. Without this, a Mon 9pm–Tue 11am event would
        # only reduce Mon's availability and leave Tue looking wide open.
        for chunk_start, chunk_end in _split_at_midnight(s, e):
            buckets.setdefault(chunk_start.date(), []).append(
                {"start": chunk_start, "end": chunk_end}
            )

    out: List[dict] = []
    for i in range(days):
        d = base + timedelta(days=i)
        events = buckets.get(d, [])
        # calculate_available_minutes anchors to the date of the first event;
        # when there are no events, it returns the full window.
        if events:
            minutes = calculate_available_minutes(events)
        else:
            minutes = _minutes_between(DAY_START, DAY_END)
        out.append({
            "date": d.isoformat(),
            "day": _DAY_LABELS[d.weekday()],
            "minutes": minutes,
        })
    return out


def detect_travel_events(
    start: date | None = None,
    days: int = 14,
) -> List[dict]:
    """Scan the user's calendar for travel events.

    Returns a list of ``{"start": "YYYY-MM-DD", "end": "YYYY-MM-DD",
    "title": str, "all_day": bool}`` entries. The end date is the day
    AFTER the last day of the trip (matches Google Calendar's all-day
    convention) so callers can compute "first 48 hours after arrival" by
    treating ``end`` as the arrival-back day.
    """
    base = start or date.today()
    creds = _get_credentials()
    service = build("calendar", "v3", credentials=creds, cache_discovery=False)

    window_start = datetime.combine(base, time.min).astimezone()
    window_end = window_start + timedelta(days=days)

    response = (
        service.events()
        .list(
            calendarId="primary",
            timeMin=window_start.isoformat(),
            timeMax=window_end.isoformat(),
            singleEvents=True,
            orderBy="startTime",
        )
        .execute()
    )

    travel: List[dict] = []
    for item in response.get("items", []):
        title = (item.get("summary") or "").lower()
        if not any(kw in title for kw in _TRAVEL_KEYWORDS):
            continue

        start_block = item.get("start", {})
        end_block = item.get("end", {})
        all_day = "date" in start_block and "dateTime" not in start_block

        if all_day:
            s_iso = start_block.get("date")
            e_iso = end_block.get("date")
            if not s_iso or not e_iso:
                continue
            travel.append({
                "start": s_iso,
                "end": e_iso,  # exclusive (Google convention)
                "title": item.get("summary", ""),
                "all_day": True,
            })
        else:
            s = _to_naive_local(start_block.get("dateTime"))
            e = _to_naive_local(end_block.get("dateTime"))
            travel.append({
                "start": s.date().isoformat(),
                "end": (e.date() + timedelta(days=1)).isoformat(),
                "title": item.get("summary", ""),
                "all_day": False,
            })

    return travel


# --- internals --------------------------------------------------------------

def _get_credentials() -> Credentials:
    """Load cached OAuth credentials, refreshing or prompting as needed."""
    creds: Credentials | None = None

    if _TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(_TOKEN_PATH), SCOPES)

    if creds and creds.valid:
        return creds

    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    else:
        if not _CREDENTIALS_PATH.exists():
            raise RuntimeError(
                f"Google Calendar credentials not found at {_CREDENTIALS_PATH}. "
                "Create an OAuth 2.0 Client ID (Desktop app) in Google Cloud "
                "Console, download the JSON, and save it there. See module "
                "docstring for setup instructions."
            )
        flow = InstalledAppFlow.from_client_secrets_file(
            str(_CREDENTIALS_PATH), SCOPES
        )
        # Opens a browser to complete the consent flow on first run.
        creds = flow.run_local_server(port=0)

    _TOKEN_PATH.write_text(creds.to_json())
    return creds


def _to_naive_local(rfc3339: str) -> datetime:
    """Parse an RFC3339 timestamp from Google and return naive local time.

    The rest of the engine works in naive local time, so we convert away the
    timezone after normalizing to the local zone.
    """
    dt = datetime.fromisoformat(rfc3339)
    if dt.tzinfo is not None:
        dt = dt.astimezone().replace(tzinfo=None)
    return dt


def _split_at_midnight(
    start: datetime, end: datetime
) -> List[tuple[datetime, datetime]]:
    """Yield per-day chunks of an event so each crossed day gets its share.

    A meeting that spans midnight (e.g., a flight from Mon 21:00 to Tue 11:00)
    needs to reduce availability on both Mon and Tue. The week-availability
    bucketer keys events by `start.date()`, which without this helper would
    miss every day after the first.
    """
    if end <= start:
        return [(start, end)]
    if start.date() == end.date():
        return [(start, end)]

    chunks: List[tuple[datetime, datetime]] = []
    cursor = start
    while cursor.date() < end.date():
        # Boundary at next local midnight.
        next_midnight = datetime.combine(
            cursor.date() + timedelta(days=1), time(0, 0)
        )
        chunks.append((cursor, next_midnight))
        cursor = next_midnight
    if cursor < end:
        chunks.append((cursor, end))
    return chunks


def _minutes_between(start: time, end: time) -> int:
    today = date.today()
    return int(
        (datetime.combine(today, end) - datetime.combine(today, start)).total_seconds()
        // 60
    )


# --- self-test --------------------------------------------------------------

def _test():
    today = date.today()

    def at(h: int, m: int = 0) -> datetime:
        return datetime.combine(today, time(h, m))

    # 1) No events -> full window (960 min).
    print("no events ->", calculate_available_minutes([]))

    # 2) One mid-day meeting splits the day; largest block is the bigger half.
    print("one meeting ->", calculate_available_minutes(
        [{"start": at(12, 0), "end": at(13, 0)}]
    ))  # 6:00-12:00 = 360, 13:00-22:00 = 540 -> 540

    # 3) Overlapping events merge before measuring gaps.
    print("overlap ->", calculate_available_minutes([
        {"start": at(9, 0), "end": at(10, 30)},
        {"start": at(10, 0), "end": at(11, 0)},
    ]))  # busy 9:00-11:00; gaps 6:00-9:00=180, 11:00-22:00=660 -> 660

    # 4) Live Google Calendar fetch (requires credentials.json + first-run auth).
    try:
        live_events = get_mock_events_for_day()
        print(f"live events -> {len(live_events)} event(s) today")
        print("live available ->", calculate_available_minutes(live_events))
    except Exception as exc:  # pragma: no cover - depends on local auth state
        print(f"live fetch skipped: {exc}")


if __name__ == "__main__":
    _test()
