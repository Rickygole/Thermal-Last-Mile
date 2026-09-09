import sys
import re
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio
import geopandas as gpd
import osmnx as ox
from rasterio.features import rasterize
from PIL import Image
from pvlib import solarposition

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as c

LEVEL_HEIGHT_M = 3.5
DEFAULT_HEIGHT_M = 3.5
HEIGHT_NOTE = (
    "OSM height tag used where present, else building:levels times 3.5 m per "
    "storey, else a flat 3.5 m single storey default when neither tag exists. "
    "3.5 m per storey follows common urban canopy model practice."
)


def parse_height_m(value):
    if value is None:
        return None
    text = str(value).strip()
    match = re.match(r"[-+]?[0-9]*\.?[0-9]+", text)
    if not match:
        return None
    return float(match.group())


def building_height(row):
    h = parse_height_m(row.get("height"))
    if h is not None and h > 0:
        return h
    levels = parse_height_m(row.get("building:levels"))
    if levels is not None and levels > 0:
        return levels * LEVEL_HEIGHT_M
    return DEFAULT_HEIGHT_M


def fetch_buildings(bounds, margin_m):
    path = c.RAW_DIR / "osm" / "buildings.geojson"
    meta_path = c.RAW_DIR / "osm" / "buildings.json"
    minx, miny = bounds["minx"] - margin_m, bounds["miny"] - margin_m
    maxx, maxy = bounds["maxx"] + margin_m, bounds["maxy"] + margin_m
    w0, s0 = c.utm_to_lonlat(minx, miny)
    e0, n0 = c.utm_to_lonlat(maxx, maxy)
    if path.exists():
        return gpd.read_file(path)
    tags = {"building": True}
    gdf = ox.features_from_bbox((w0, s0, e0, n0), tags).reset_index()
    gdf["geometry"] = gdf["geometry"].apply(
        lambda g: g if g.geom_type in ("Polygon", "MultiPolygon") else None
    )
    gdf = gdf[gdf["geometry"].notna()].copy()
    gdf.to_file(path, driver="GeoJSON")
    c.write_json(
        meta_path,
        {
            "source": "OpenStreetMap via Overpass API, osmnx.features_from_bbox",
            "tags": tags,
            "bbox_lonlat": [w0, s0, e0, n0],
            "margin_m": margin_m,
            "fetched_utc": c.now_iso(),
            "n_features": int(len(gdf)),
            "substitution_note": "Real Houston LiDAR DSM was not fetched. A DSM was built from OSM building footprints instead.",
        },
    )
    return gdf


def build_dsm(bounds, margin_m):
    dsm_path = c.INTERIM_DIR / "dsm.tif"
    dsm_meta_path = c.INTERIM_DIR / "dsm_meta.json"
    res = bounds["resolution_m"]
    pad_cells = int(round(margin_m / res))
    width = bounds["width"] + 2 * pad_cells
    height = bounds["height"] + 2 * pad_cells
    minx = bounds["minx"] - pad_cells * res
    maxy = bounds["maxy"] + pad_cells * res
    if dsm_path.exists():
        with rasterio.open(dsm_path) as src:
            dsm = src.read(1)
        return dsm, pad_cells

    gdf = fetch_buildings(bounds, margin_m)
    gdf = gdf.to_crs(bounds["crs"])
    gdf["height_m"] = gdf.apply(building_height, axis=1)
    shapes = [
        (geom, height_m)
        for geom, height_m in zip(gdf.geometry, gdf["height_m"])
        if geom is not None and not geom.is_empty
    ]
    transform = rasterio.transform.from_origin(minx, maxy, res, res)
    dsm = rasterize(
        shapes,
        out_shape=(height, width),
        transform=transform,
        fill=0.0,
        dtype="float32",
    )
    profile = {
        "driver": "GTiff",
        "height": height,
        "width": width,
        "count": 1,
        "dtype": "float32",
        "crs": bounds["crs"],
        "transform": transform,
    }
    with rasterio.open(dsm_path, "w", **profile) as dst:
        dst.write(dsm, 1)
    c.write_json(
        dsm_meta_path,
        {
            "n_buildings_rasterized": len(shapes),
            "height_source_note": HEIGHT_NOTE,
            "resolution_m": res,
            "pad_cells": pad_cells,
            "max_height_m": float(dsm.max()),
        },
    )
    return dsm, pad_cells


def sun_position(hour, date_str):
    site = c.CFG["site"]
    local_dt = pd.Timestamp(f"{date_str} {hour:02d}:00:00", tz=c.LOCAL_TZ)
    times = pd.DatetimeIndex([local_dt])
    sp = solarposition.get_solarposition(
        times, site["lat"], site["lon"], altitude=15.0, method="nrel_numba"
    )
    return float(sp["azimuth"].iloc[0]), float(sp["apparent_elevation"].iloc[0])


def raymarch_shade(dsm, pad_cells, bounds, azimuth_deg, elevation_deg, max_steps):
    height = bounds["height"]
    width = bounds["width"]
    if elevation_deg <= 0:
        return np.ones((height, width), dtype=bool)

    az_rad = np.radians(azimuth_deg)
    elev_rad = np.radians(elevation_deg)
    sin_az = np.sin(az_rad)
    cos_az = np.cos(az_rad)
    tan_elev = np.tan(elev_rad)

    core = dsm[pad_cells : pad_cells + height, pad_cells : pad_cells + width]
    shaded = np.zeros((height, width), dtype=bool)
    active = np.ones((height, width), dtype=bool)

    prev_col_off = None
    prev_row_off = None
    for step in range(1, max_steps + 1):
        dx = step * sin_az
        dy = step * cos_az
        col_off = int(round(dx))
        row_off = int(round(-dy))
        if col_off == prev_col_off and row_off == prev_row_off:
            continue
        prev_col_off, prev_row_off = col_off, row_off
        required_height = step * tan_elev
        window = dsm[
            pad_cells + row_off : pad_cells + row_off + height,
            pad_cells + col_off : pad_cells + col_off + width,
        ]
        blocked = window > required_height
        newly = blocked & active
        shaded |= newly
        active &= ~newly
        if not active.any():
            break
    return shaded


def build_hour(hour, bounds, dsm, pad_cells):
    date_str = c.hottest_date_for_hour(hour)
    azimuth, elevation = sun_position(hour, date_str)
    max_steps = c.CFG["raster"]["max_march_steps"]
    shaded = raymarch_shade(dsm, pad_cells, bounds, azimuth, elevation, max_steps)

    transform = c.raster_transform(bounds)
    profile = {
        "driver": "GTiff",
        "height": bounds["height"],
        "width": bounds["width"],
        "count": 1,
        "dtype": "uint8",
        "crs": bounds["crs"],
        "transform": transform,
    }
    tif_path = c.INTERIM_DIR / f"shade_{hour:02d}.tif"
    with rasterio.open(tif_path, "w", **profile) as dst:
        dst.write(shaded.astype("uint8"), 1)

    png_path = c.OUT_DIR / f"shade_{hour:02d}.png"
    img = (shaded.astype(np.uint8)) * 255
    Image.fromarray(img, mode="L").save(png_path)

    meta = {
        "hour_local": hour,
        "date_used": date_str,
        "sun_azimuth_deg": azimuth,
        "sun_elevation_deg": elevation,
        "max_march_steps": max_steps,
        "shaded_fraction": float(shaded.mean()),
    }
    c.write_json(c.INTERIM_DIR / f"shade_{hour:02d}_meta.json", meta)
    print(
        f"hour {hour}: sun az {azimuth:.1f} elev {elevation:.1f}, shaded fraction {meta['shaded_fraction']:.3f}"
    )
    return meta


def main():
    c.ensure_dirs()
    bounds = c.get_raster_bounds()
    margin_m = c.CFG["raster"]["max_march_steps"] * c.CFG["raster"]["resolution_m"]
    dsm, pad_cells = build_dsm(bounds, margin_m)
    for hour in c.kickoff_hours():
        build_hour(hour, bounds, dsm, pad_cells)


if __name__ == "__main__":
    main()
