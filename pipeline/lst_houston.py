import sys
from pathlib import Path

import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as c
import s7_cities as cities

LST_DIR = c.RAW_DIR / "landsat"
LST_TIF_PATH = LST_DIR / "lst_field.tif"
LST_META_PATH = LST_DIR / "lst_field.json"

BETA = c.CFG["uhi"]["beta_lst_to_tair"]
BETA_CITATION = c.COSTS["constants"]["uhi_coupling_beta"]["citation"]
BETA_NOTE = c.COSTS["constants"]["uhi_coupling_beta"]["note"]

OVERPASS_TIME_NOTE = (
    "Landsat 8 and 9 cross the Houston area near 10:30 to 11:00 local solar time, "
    "well before the 15:00 to 21:00 local kickoff hours this pipeline studies. "
    "The land surface temperature field pulled here is used only for its spatial "
    "pattern of hotter and cooler surfaces across the study area, applied as an "
    "anomaly on top of the afternoon and evening ASOS station observations that "
    "already set the absolute air temperature level for each kickoff hour. Using "
    "a late morning surface pattern as a proxy for the afternoon and evening "
    "spatial pattern is a defensible modeling choice, since the built environment "
    "and vegetation that create the pattern do not move, but it is also a real "
    "limitation, this is a morning spatial proxy stacked on afternoon and evening "
    "absolute values, not a same time observation of either quantity."
)


def search_bbox(bounds, pad_deg=0.002):
    w0, s0, e0, n0 = bounds["lonlat_bounds"]
    return [w0 - pad_deg, s0 - pad_deg, e0 + pad_deg, n0 + pad_deg]


def fetch_lst_field(bounds, force=False):
    if LST_TIF_PATH.exists() and LST_META_PATH.exists() and not force:
        with rasterio.open(LST_TIF_PATH) as src:
            field = src.read(1)
        meta = c.read_json(LST_META_PATH)
        return field, meta

    LST_DIR.mkdir(parents=True, exist_ok=True)
    bbox = search_bbox(bounds)

    candidates = []
    for year in cities.LST_YEARS:
        try:
            candidates.extend(cities.search_warm_season_scenes(bbox, year))
        except Exception:
            continue
    if not candidates:
        raise RuntimeError("no warm season Landsat scenes found for the NRG study area")

    candidates.sort(key=lambda f: f["properties"].get("eo:cloud_cover", 100.0))
    candidates = candidates[: cities.LST_MAX_SCENES]

    dst_transform = c.raster_transform(bounds)
    dst_crs = bounds["crs"]
    dst_shape = (bounds["height"], bounds["width"])

    stacked = []
    used_scenes = []
    for f in candidates:
        try:
            href = f["assets"]["lwir11"]["href"]
            signed = cities.sign_href(href)
            with rasterio.open("/vsicurl/" + signed) as src:
                dst_dn = np.zeros(dst_shape, dtype="float64")
                reproject(
                    source=rasterio.band(src, 1),
                    destination=dst_dn,
                    src_transform=src.transform,
                    src_crs=src.crs,
                    dst_transform=dst_transform,
                    dst_crs=dst_crs,
                    resampling=Resampling.bilinear,
                    src_nodata=0,
                    dst_nodata=0,
                )
            temp_k = dst_dn * 0.00341802 + 149.0
            temp_c = temp_k - 273.15
            valid = (dst_dn > 0) & (temp_c > -10) & (temp_c < 65)
            if not valid.any():
                continue
            layer = np.where(valid, temp_c, np.nan)
            stacked.append(layer)
            used_scenes.append(
                {
                    "scene_id": f["id"],
                    "date": f["properties"]["datetime"][:10],
                    "cloud_cover_pct": f["properties"].get("eo:cloud_cover"),
                    "valid_fraction_on_grid": float(valid.mean()),
                }
            )
        except Exception:
            continue

    if not stacked:
        raise RuntimeError("no usable Landsat ST_B10 pixels reprojected onto the study grid")

    stack = np.stack(stacked, axis=0)
    with np.errstate(invalid="ignore"):
        field = np.nanmean(stack, axis=0)
    nan_mask = np.isnan(field)
    if nan_mask.any():
        fill_value = float(np.nanmean(field))
        field = np.where(nan_mask, fill_value, field)
    field = field.astype("float32")

    profile = {
        "driver": "GTiff",
        "height": bounds["height"],
        "width": bounds["width"],
        "count": 1,
        "dtype": "float32",
        "crs": bounds["crs"],
        "transform": dst_transform,
    }
    with rasterio.open(LST_TIF_PATH, "w", **profile) as dst:
        dst.write(field, 1)

    meta = {
        "source": "Landsat Collection 2 Level 2, ST_B10 surface temperature band, Landsat 8 and 9",
        "access": "Microsoft Planetary Computer STAC API, collection landsat-c2-l2, asset lwir11, signed via the public SAS token endpoint, read with rasterio over HTTPS, reprojected with bilinear resampling directly onto the same 1 m pipeline raster grid used by every other layer",
        "measurement": "per pixel mean of Digital Number to Kelvin to Celsius converted ST_B10 values, pooled across the clearest warm season scenes found, reprojected onto the study grid before averaging so the composite keeps genuine sub area spatial structure rather than collapsing to one number",
        "bbox_lonlat_searched": bbox,
        "years_searched": cities.LST_YEARS,
        "warm_season_window": "June 1 through August 31 of each searched year",
        "max_cloud_cover_pct": cities.LST_MAX_CLOUD,
        "max_scenes_pooled": cities.LST_MAX_SCENES,
        "n_scenes_used": len(used_scenes),
        "scenes": used_scenes,
        "lst_area_mean_c": float(np.mean(field)),
        "lst_min_c": float(np.min(field)),
        "lst_max_c": float(np.max(field)),
        "lst_range_c": float(np.max(field) - np.min(field)),
        "overpass_time_note": OVERPASS_TIME_NOTE,
        "is_proxy": False,
        "fetched_utc": c.now_iso(),
    }
    c.write_json(LST_META_PATH, meta)
    return field, meta


def get_uhi_field(bounds):
    field, meta = fetch_lst_field(bounds)
    return field, float(meta["lst_area_mean_c"]), meta


def apply_uhi(tair_grid, lst_field, lst_area_mean):
    return (tair_grid + BETA * (lst_field - lst_area_mean)).astype(np.float32)


def uhi_meta_block(lst_meta):
    return {
        "beta_lst_to_tair": BETA,
        "beta_citation": BETA_CITATION,
        "beta_note": BETA_NOTE,
        "lst_source": lst_meta["source"],
        "lst_access": lst_meta["access"],
        "lst_scenes_used": lst_meta["scenes"],
        "n_lst_scenes_used": lst_meta["n_scenes_used"],
        "lst_years_searched": lst_meta["years_searched"],
        "lst_max_cloud_cover_pct": lst_meta["max_cloud_cover_pct"],
        "lst_area_mean_c": lst_meta["lst_area_mean_c"],
        "lst_min_c": lst_meta["lst_min_c"],
        "lst_max_c": lst_meta["lst_max_c"],
        "lst_range_c": lst_meta["lst_range_c"],
        "overpass_time_note": lst_meta["overpass_time_note"],
    }


def main():
    c.ensure_dirs()
    bounds = c.get_raster_bounds()
    field, meta = fetch_lst_field(bounds)
    print(f"lst scenes used: {meta['n_scenes_used']}")
    for s in meta["scenes"]:
        print(f"  {s['scene_id']} {s['date']} cloud {s['cloud_cover_pct']}")
    print(f"lst range on grid: {meta['lst_min_c']:.2f} to {meta['lst_max_c']:.2f} C, mean {meta['lst_area_mean_c']:.2f} C")


if __name__ == "__main__":
    main()
