import sys
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as c
import lst_houston as lst

DIFFUSE_FRACTION_SHADED = c.COSTS["constants"]["diffuse_fraction_shaded"]["value"]
GROUND_ALBEDO = c.CFG["shade"]["ground_albedo"]
LILJEGREN_SURFACE_ALBEDO = c.CFG["shade"]["liljegren_surface_albedo"]
SHADE_MODEL_NOTE = (
    "shaded cells are evaluated with the direct beam fraction forced to zero and a shortwave "
    "load of (sky diffuse fraction + ground albedo) times the clear sky global horizontal "
    "irradiance, divided by (1 + the surface albedo the Liljegren globe budget already applies) "
    "so the ground reflected term is counted once. the reflecting ground is treated as sunlit, "
    "which is the case for a pedestrian under a sail or a tree on an otherwise open street. "
    "the 2 m wind used for a shaded cell is the one the Liljegren wind extrapolation returns for "
    "the sunlit boundary layer, since shade does not change the stability of the surface layer. "
    "not modelled: longwave emitted by pavement hotter than air, because the Liljegren globe and "
    "wick budgets fix the surface radiating temperature at air temperature and the implementation "
    "does not expose it. that assumption is identical in the sunlit and shaded cases, so it biases "
    "the absolute WBGT low in both and largely cancels in the shade benefit"
)


def read_band(path):
    with rasterio.open(path) as src:
        return src.read(1)


def wbgt_sun_and_shade(utc_dt, lat, lon, ghi_full_sun, pres, tair, tdew, wind):
    from metpy.units import units
    from pywbgt import liljegrenWBGT, liljegren
    from pywbgt.solar import solar_parameters

    n = tair.size
    dt_index = pd.DatetimeIndex([utc_dt] * n)
    d_globe = c.GLOBE_DIAMETER_M * units.m
    sun = liljegrenWBGT(
        dt_index,
        lat,
        lon,
        np.full(n, ghi_full_sun) * units("W/m^2"),
        pres * units.hPa,
        tair * units.degC,
        tdew * units.degC,
        wind * units("m/s"),
        d_globe=d_globe,
        zspeed=c.PEDESTRIAN_HEIGHT_M * units.m,
    )
    wbgt_sun = np.asarray(sun["Twbg"], dtype=np.float32)
    if ghi_full_sun <= 0:
        return wbgt_sun, wbgt_sun.copy()

    solar_adj, cza, _ = solar_parameters(dt_index, lat, lon, np.full(n, ghi_full_sun))
    speed = np.asarray(sun["speed"], dtype=np.float64)
    load = solar_adj * (DIFFUSE_FRACTION_SHADED + GROUND_ALBEDO) / (1.0 + LILJEGREN_SURFACE_ALBEDO)
    fdir = np.zeros(n)
    tg = liljegren.globe_temperature(tair, tdew, pres, speed, load, fdir, cza, d_globe=d_globe)
    tnwb = liljegren.natural_wetbulb(tair, tdew, pres, speed, load, fdir, cza)
    wbgt_shade = (0.1 * tair + 0.2 * tg + 0.7 * tnwb).astype(np.float32)
    return wbgt_sun, wbgt_shade


def build_hour(hour, bounds):
    wbgt_meta = c.read_json(c.INTERIM_DIR / f"wbgt_{hour:02d}_meta.json")
    stations = wbgt_meta["stations"]

    tair_grid, tdew_grid, wind_grid, pres_grid = c.station_grids(bounds, stations)
    lst_field, lst_area_mean, lst_meta = lst.get_uhi_field(bounds)
    tair_grid = lst.apply_uhi(tair_grid, lst_field, lst_area_mean)

    ghi_full_sun = wbgt_meta["ghi_full_sun_wm2"]
    utc_dt = pd.Timestamp(wbgt_meta["utc_datetime_used"])
    lon_grid, lat_grid = c.grid_centers_lonlat(bounds)

    wbgt_sun = read_band(c.INTERIM_DIR / f"wbgt_{hour:02d}.tif")
    _, wbgt_shaded = wbgt_sun_and_shade(
        utc_dt,
        lat_grid.ravel(),
        lon_grid.ravel(),
        ghi_full_sun,
        pres_grid.ravel().astype(np.float64),
        tair_grid.ravel().astype(np.float64),
        tdew_grid.ravel().astype(np.float64),
        wind_grid.ravel().astype(np.float64),
    )
    wbgt_shaded = wbgt_shaded.reshape(tair_grid.shape)

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
        "ground_albedo": GROUND_ALBEDO,
        "liljegren_surface_albedo": LILJEGREN_SURFACE_ALBEDO,
        "shade_model_note": SHADE_MODEL_NOTE,
        "ghi_full_sun_wm2": ghi_full_sun,
        "shaded_sky_diffuse_wm2": DIFFUSE_FRACTION_SHADED * ghi_full_sun,
        "shaded_ground_reflected_wm2": GROUND_ALBEDO * ghi_full_sun,
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
