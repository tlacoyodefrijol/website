#!/usr/bin/env python3
"""
Download real Ecobici (Mexico City bike-share) trips for a date range and
build the stations/trips JSON that render.py animates.

Source: Ecobici's public open-data CSVs (one file per calendar month) at
ecobici.cdmx.gob.mx/open-data, joined against the live GBFS station feed for
coordinates. Trips are folded onto a single 24h clock by time-of-day only
(the day they happened on is discarded) -- same approach the site's
background.js uses, generalized from one hardcoded week to any date range.

Usage:
  python3 fetch_data.py --start 2026-06-15 --end 2026-06-21 --out data.json
"""
import argparse
import csv
import json
import re
import sys
from datetime import date, datetime
from pathlib import Path
from urllib.request import Request, urlopen

UA = "Mozilla/5.0 (compatible; ecobici-viz/1.0)"
OPEN_DATA_PAGE = "https://ecobici.cdmx.gob.mx/en/open-data/"
STATIONS_FEED = "https://gbfs.mex.lyftbikes.com/gbfs/en/station_information.json"
CACHE_DIR = Path(__file__).parent / ".cache"


def fetch(url: str) -> bytes:
    with urlopen(Request(url, headers={"User-Agent": UA}), timeout=120) as r:
        return r.read()


def month_csv_urls() -> dict[str, str]:
    """{'YYYY-MM': full_csv_url} scraped from the open-data page's real link
    list -- the upload folder (year/month it was published) doesn't match
    the data's own month, so this can't be guessed, only scraped."""
    html = fetch(OPEN_DATA_PAGE).decode("utf-8", "ignore")
    urls = {}
    for href in re.findall(r'href="(/wp-content/uploads/[^"]+\.csv)"', html):
        m = re.search(r"(\d{4})-(\d{2})", href.rsplit("/", 1)[-1])
        if m:
            urls[f"{m.group(1)}-{m.group(2)}"] = "https://ecobici.cdmx.gob.mx" + href
    return urls


def months_between(start: date, end: date) -> list[str]:
    months, cur = [], date(start.year, start.month, 1)
    while cur <= end:
        months.append(f"{cur.year:04d}-{cur.month:02d}")
        cur = date(cur.year + (cur.month == 12), cur.month % 12 + 1, 1)
    return months


def cached_month_csv(month: str, url: str) -> Path:
    CACHE_DIR.mkdir(exist_ok=True)
    path = CACHE_DIR / f"{month}.csv"
    if not path.exists():
        print(f"  downloading {month} ({url}) ...", file=sys.stderr)
        path.write_bytes(fetch(url))
    return path


def norm_station_code(code: str) -> str:
    """Both the CSV and the GBFS feed use zero-padded numeric station codes,
    but not always padded to the same width -- compare on the number."""
    return code.strip().lstrip("0") or "0"


def station_coords() -> dict[str, tuple[float, float]]:
    data = json.loads(fetch(STATIONS_FEED))
    return {norm_station_code(s["short_name"]): (s["lat"], s["lon"]) for s in data["data"]["stations"]}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--start", required=True, help="YYYY-MM-DD, inclusive")
    ap.add_argument("--end", required=True, help="YYYY-MM-DD, inclusive")
    ap.add_argument("--out", default="data.json")
    args = ap.parse_args()

    start = datetime.strptime(args.start, "%Y-%m-%d").date()
    end = datetime.strptime(args.end, "%Y-%m-%d").date()
    if end < start:
        sys.exit("--end must not be before --start")

    print("Fetching station coordinates (GBFS)...", file=sys.stderr)
    coords_by_code = station_coords()

    print("Finding source CSVs...", file=sys.stderr)
    available = month_csv_urls()
    needed = months_between(start, end)
    missing = [m for m in needed if m not in available]
    if missing:
        sys.exit(f"No Ecobici open-data CSV found for: {', '.join(missing)} "
                  f"(only {min(available)}..{max(available)} are published)")

    stations: list[list[float]] = []
    station_index: dict[str, int] = {}
    trips: list[list] = []

    def station_idx(code: str) -> int | None:
        code = norm_station_code(code)
        if code not in coords_by_code:
            return None
        if code not in station_index:
            station_index[code] = len(stations)
            lat, lon = coords_by_code[code]
            stations.append([lat, lon])
        return station_index[code]

    unmatched = 0
    for month in needed:
        csv_path = cached_month_csv(month, available[month])
        print(f"  parsing {csv_path.name} ...", file=sys.stderr)
        with csv_path.open(encoding="utf-8-sig", errors="ignore", newline="") as f:
            for row in csv.DictReader(f):
                try:
                    d = datetime.strptime(row["Fecha_Retiro"].strip(), "%d/%m/%Y").date()
                except (KeyError, ValueError):
                    continue
                if not (start <= d <= end):
                    continue
                try:
                    h, m, s = (int(x) for x in row["Hora_Retiro"].strip().split(":"))
                except (KeyError, ValueError):
                    continue
                o = station_idx(row.get("Ciclo_Estacion_Retiro", ""))
                dest = station_idx(row.get("Ciclo_EstacionArribo", ""))
                if o is None or dest is None:
                    unmatched += 1
                    continue
                trips.append([o, dest, h * 3600 + m * 60 + s])

    trips.sort(key=lambda t: t[2])
    out = {
        "stations": stations,
        "trips": trips,
        "meta": {
            "start": args.start,
            "end": args.end,
            "trip_count": len(trips),
            "station_count": len(stations),
            "unmatched_stations_skipped": unmatched,
            "note": "trips[2] is seconds-of-day; render.py folds it onto --loop-seconds",
        },
    }
    Path(args.out).write_text(json.dumps(out))
    print(f"Wrote {args.out}: {len(trips)} trips, {len(stations)} stations "
          f"({unmatched} trips skipped for unknown stations)", file=sys.stderr)


if __name__ == "__main__":
    main()
