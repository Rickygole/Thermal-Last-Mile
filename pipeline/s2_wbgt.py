import sys
from pathlib import Path
from zoneinfo import ZoneInfo
from datetime import datetime

import numpy as np
import pandas as pd
import rasterio
from pvlib.location import Location
from pvlib import solarposition

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as c

TAIR_TOLERANCE_C = 1.0
TOLERANCE_NOTE = (
    "ASOS air temperature sensor accuracy is approximately 0.6 C per NWS ASOS "
    "technical spec, widened to 1.0 C to also cover representativeness error "
    "from interpolating three stations 10 to 40 km from the site"
)
DATE_SELECTION_NOTE = (
    "of the three match dates in config.yml, the hour uses whichever single date "
    "had the hottest mean observed air temperature across the three ASOS stations, "
    "rather than averaging conditions across dates, so a real hot day is not "
    "smoothed away by cooler sampled days"
)


def clearsky_ghi(date_str, hour):
    site = c.CFG["site"]
    loc = Location(site["lat"], site["lon"], tz=c.LOCAL_TZ, altitude=15.0)
    local_dt = pd.Timestamp(f"{date_str} {hour:02d}:00:00", tz=c.LOCAL_TZ)
    times = pd.DatetimeIndex([local_dt])
    sp = solarposition.get_solarposition(
        times, loc.latitude, loc.longitude, altitude=loc.altitude, method="nrel_numba"
    )
    cs = loc.get_clearsky(times, model="ineichen", solar_position=sp)
    return float(cs["ghi"].iloc[0])


def hour_to_utc_naive(date_str, hour):
    local_dt = datetime.strptime(f"{date_str} {hour:02d}:00", "%Y-%m-%d %H:%M")
    local_dt = local_dt.replace(tzinfo=ZoneInfo(c.LOCAL_TZ))
    utc_dt = local_dt.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
    return utc_dt


def build_hour(hour, bounds):
    date_str = c.hottest_date_for_hour(hour)
    stations = list(c.ASOS_STATIONS.keys())
    station_stats = {s: c.station_hour_obs(s, date_str, hour) for s in stations}
    missing = [s for s, v in station_stats.items() if v is None]
    if missing:
        raise RuntimeError(f"missing ASOS obs for {missing} on {date_str} hour {hour}")

    tair_grid, tdew_grid, wind_grid, pres_grid = c.station_grids(bounds, station_stats)
    ghi = clearsky_ghi(date_str, hour)
    utc_dt = hour_to_utc_naive(date_str, hour)
    wbgt = c.compute_wbgt_grid(bounds, tair_grid, tdew_grid, wind_grid, pres_grid, ghi, utc_dt)

    transform = c.raster_transform(bounds)
    profile = {
        "driver": "GTiff",
        "height": bounds["height"],
        "width": bounds["width"],
        "count": 1,
        "dtype": "float32",
        "crs": bounds["crs"],
        "transform": transform,
    }
    out_path = c.INTERIM_DIR / f"wbgt_{hour:02d}.tif"
    with rasterio.open(out_path, "w", **profile) as dst:
        dst.write(wbgt, 1)

    meta = {
        "hour_local": hour,
        "date_used": date_str,
        "match_dates_considered": c.match_dates(),
        "date_selection_note": DATE_SELECTION_NOTE,
        "utc_datetime_used": str(utc_dt),
        "stations": station_stats,
        "ghi_full_sun_wm2": ghi,
        "solar_source": "pvlib.clearsky ineichen model, NREL NSRDB required an API key and was not reachable from this environment",
        "wbgt_model": "pywbgt.liljegrenWBGT",
        "tair_tolerance_c": TAIR_TOLERANCE_C,
        "tair_tolerance_note": TOLERANCE_NOTE,
        "wbgt_min_c": float(np.min(wbgt)),
        "wbgt_max_c": float(np.max(wbgt)),
        "wbgt_mean_c": float(np.mean(wbgt)),
    }
    c.write_json(c.INTERIM_DIR / f"wbgt_{hour:02d}_meta.json", meta)
    print(
        f"hour {hour}: date {date_str}, wbgt {meta['wbgt_min_c']:.2f} to {meta['wbgt_max_c']:.2f} C, ghi {ghi:.0f} W/m2"
    )
    return meta


def main():
    c.ensure_dirs()
    bounds = c.get_raster_bounds()
    for hour in c.kickoff_hours():
        build_hour(hour, bounds)


if __name__ == "__main__":
    main()
