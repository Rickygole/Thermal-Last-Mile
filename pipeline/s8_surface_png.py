import sys
from pathlib import Path

import numpy as np
import rioxarray as rxr
from PIL import Image
from rasterio.enums import Resampling

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as c

GRID = 640
DOMAIN_PAD_C = 1.0


def hour_field(hour):
    a = rxr.open_rasterio(c.INTERIM_DIR / f"expo_{hour:02d}.tif").squeeze()
    a = a.rio.reproject("EPSG:4326", resampling=Resampling.bilinear)
    a = a.rio.reproject(
        "EPSG:4326",
        shape=(GRID, GRID),
        resampling=Resampling.bilinear,
    )
    return a


def main():
    hours = c.kickoff_hours()
    fields = {h: hour_field(h) for h in hours}

    lo = min(float(np.nanmin(np.asarray(f))) for f in fields.values()) - DOMAIN_PAD_C
    hi = max(float(np.nanmax(np.asarray(f))) for f in fields.values()) + DOMAIN_PAD_C
    lo, hi = float(np.floor(lo)), float(np.ceil(hi))

    ref = fields[hours[0]]
    west, south, east, north = ref.rio.bounds()

    hour_stats = {}
    for h in hours:
        v = np.asarray(fields[h], dtype=np.float64)
        valid = np.isfinite(v)
        norm = np.clip((v - lo) / (hi - lo), 0.0, 1.0)
        band = np.where(valid, np.round(norm * 255.0), 0).astype(np.uint8)
        alpha = np.where(valid, 255, 0).astype(np.uint8)
        img = Image.fromarray(np.dstack([band, band, band, alpha]), mode="RGBA")
        img.save(c.OUT_DIR / f"expo_{h:02d}.png")
        stats = {
            "min_c": round(float(np.nanmin(v)), 2),
            "max_c": round(float(np.nanmax(v)), 2),
            "mean_c": round(float(np.nanmean(v)), 2),
        }
        shade_meta_path = c.INTERIM_DIR / f"shade_{h:02d}_meta.json"
        if shade_meta_path.exists():
            sm = c.read_json(shade_meta_path)
            if "sun_elevation_deg" in sm:
                stats["sun_elevation_deg"] = round(float(sm["sun_elevation_deg"]), 2)
            if "sun_azimuth_deg" in sm:
                stats["sun_azimuth_deg"] = round(float(sm["sun_azimuth_deg"]), 2)
        hour_stats[str(h)] = stats

    meta = {
        "generated_utc": c.now_iso(),
        "provisional": False,
        "quantity": "wet bulb globe temperature",
        "unit": "degrees celsius",
        "domain_c": [lo, hi],
        "encoding": "single channel 8 bit in RGB, alpha marks valid cells, value maps linearly across domain_c",
        "bounds": [west, south, east, north],
        "grid": [GRID, GRID],
        "hours": [str(h) for h in hours],
        "threshold_c": c.CFG["walk"]["wbgt_threshold_c"],
        "method": "resampled directly from the pipeline exposure rasters written by stage 4, which combine the Liljegren wet bulb globe temperature grid with the raymarched shade mask and the Landsat coupled urban heat island field",
        "sun_position_source": "pvlib solar position solved in the shadow bake stage, the same geometry that produced the shade masks",
        "source_rasters": [f"data/interim/expo_{h:02d}.tif" for h in hours],
        "native_resolution_m": c.CFG["raster"]["resolution_m"],
        "hour_stats": hour_stats,
    }
    c.write_json(c.OUT_DIR / "expo_meta.json", meta)
    print(f"domain {lo} to {hi} C")
    for h in hours:
        print(f"  expo_{h:02d}.png {hour_stats[str(h)]}")


if __name__ == "__main__":
    main()
