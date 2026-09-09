import sys
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio
from metpy.units import units
from pywbgt import liljegrenWBGT

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as c

DIFFUSE_FRACTION_SHADED = c.COSTS["constants"]["diffuse_fraction_shaded"]["value"]


def read_band(path):
    with rasterio.open(path) as src:
        return src.read(1)


def build_hour(hour, bounds):
    wbgt_meta = c.read_json(c.INTERIM_DIR / f"wbgt_{hour:02d}_meta.json")
    stations = wbgt_meta["stations"]

    tair_grid = c.idw_grid(bounds, {s: v["tair_c"] for s, v in stations.items()})
    tdew_grid = c.idw_grid(bounds, {s: v["tdew_c"] for s, v in stations.items()})
    wind_grid = c.idw_grid(bounds, {s: v["wind_ms"] for s, v in stations.items()})
    pres_grid = c.idw_grid(bounds, {s: v["pres_hpa"] for s, v in stations.items()})
    lon_grid, lat_grid = c.grid_centers_lonlat(bounds)

    ghi_shaded = wbgt_meta["ghi_full_sun_wm2"] * DIFFUSE_FRACTION_SHADED
    utc_dt = pd.Timestamp(wbgt_meta["utc_datetime_used"])
    n = tair_grid.size
    dt_index = pd.DatetimeIndex([utc_dt] * n)

    wbgt_sun = read_band(c.INTERIM_DIR / f"wbgt_{hour:02d}.tif")

    if wbgt_meta["ghi_full_sun_wm2"] <= 0:
        wbgt_shaded = wbgt_sun.copy()
    else:
        out = liljegrenWBGT(
            dt_index,
            lat_grid.ravel(),
            lon_grid.ravel(),
            np.full(n, ghi_shaded) * units("W/m^2"),
            pres_grid.ravel() * units.hPa,
            tair_grid.ravel() * units.degC,
            tdew_grid.ravel() * units.degC,
            wind_grid.ravel() * units("m/s"),
        )
        wbgt_shaded = np.asarray(out["Twbg"], dtype=np.float32).reshape(tair_grid.shape)

    shade_mask = read_band(c.INTERIM_DIR / f"shade_{hour:02d}.tif").astype(bool)
    exposure = np.where(shade_mask, wbgt_shaded, wbgt_sun).astype(np.float32)

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
    out_path = c.INTERIM_DIR / f"expo_{hour:02d}.tif"
    with rasterio.open(out_path, "w", **profile) as dst:
        dst.write(exposure, 1)

    meta = {
        "hour_local": hour,
        "diffuse_fraction_shaded": DIFFUSE_FRACTION_SHADED,
        "ghi_full_sun_wm2": wbgt_meta["ghi_full_sun_wm2"],
        "ghi_shaded_wm2": ghi_shaded,
        "wbgt_sun_mean_c": float(np.mean(wbgt_sun)),
        "wbgt_shaded_mean_c": float(np.mean(wbgt_shaded)),
        "exposure_min_c": float(np.min(exposure)),
        "exposure_max_c": float(np.max(exposure)),
        "shaded_fraction": float(shade_mask.mean()),
    }
    c.write_json(c.INTERIM_DIR / f"expo_{hour:02d}_meta.json", meta)
    print(
        f"hour {hour}: sun {meta['wbgt_sun_mean_c']:.2f} C, shade {meta['wbgt_shaded_mean_c']:.2f} C, "
        f"exposure {meta['exposure_min_c']:.2f} to {meta['exposure_max_c']:.2f} C"
    )
    return meta


def main():
    c.ensure_dirs()
    bounds = c.get_raster_bounds()
    for hour in c.kickoff_hours():
        build_hour(hour, bounds)


if __name__ == "__main__":
    main()
