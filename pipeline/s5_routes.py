import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio
from shapely.geometry import LineString
from shapely.ops import substring

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as c
import lst_houston as lst

PATH_WIDTH_M = 2.0
PATH_WIDTH_NOTE = (
    "walking path width assumed 2.0 m, a typical clear pedestrian zone width, "
    "used only to convert an intervention shaded_area_m2 into a coverage "
    "fraction of a segment for the optimizer, not an observed measurement"
)

NRG_CAPACITY = 72220
NRG_CAPACITY_NOTE = "Houston Texans official NRG Stadium seating capacity"
APPROACH_MODE_SHARE = {
    "metrorail_stadium_park": 0.10,
    "lot_c": 0.45,
    "rideshare_kirby": 0.15,
    "fan_fest": 0.10,
}
MODE_SHARE_NOTE = (
    "approach mode shares are a modeled assumption, not an observed survey, "
    "reflecting a Sunbelt surface lot dominant stadium like NRG where most "
    "fans park and walk, with smaller transit, rideshare and fan fest shares. "
    "shares sum to less than 1.0 since a residual share arrives directly at "
    "gates by other means not represented by these four origins"
)

WBGT_THRESHOLD_C = c.CFG["walk"]["wbgt_threshold_c"]
WALK_SPEED_MPS = c.CFG["walk"]["speed_mps"]
SEGMENT_LENGTH_M = c.CFG["walk"]["segment_length_m"]
SAMPLE_SPACING_M = c.CFG["walk"]["sample_spacing_m"]

TREATABLE = sorted(
    name for name, spec in c.COSTS["interventions"].items() if spec.get("blocks_direct_beam")
)


def slugify(text):
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "_", text).strip("_")
    return text or "segment"


def read_band(path):
    with rasterio.open(path) as src:
        return src.read(1)


def rowcol(bounds, xs, ys):
    res = bounds["resolution_m"]
    cols = np.clip(((xs - bounds["minx"]) / res).astype(int), 0, bounds["width"] - 1)
    rows = np.clip(((bounds["maxy"] - ys) / res).astype(int), 0, bounds["height"] - 1)
    return rows, cols


def load_hour_layers(bounds, hours):
    layers = {}
    for hour in hours:
        wbgt_meta = c.read_json(c.INTERIM_DIR / f"wbgt_{hour:02d}_meta.json")
        layers[hour] = {
            "expo": read_band(c.INTERIM_DIR / f"expo_{hour:02d}.tif"),
            "shade": read_band(c.INTERIM_DIR / f"shade_{hour:02d}.tif").astype(bool),
            "meta": wbgt_meta,
        }
    for hour in hours:
        tol = layers[hour]["meta"]["tair_tolerance_c"]
        layers[hour]["expo_lo"] = expo_variant(bounds, hour, layers[hour]["meta"], -tol, layers[hour]["shade"])
        layers[hour]["expo_hi"] = expo_variant(bounds, hour, layers[hour]["meta"], tol, layers[hour]["shade"])
    return layers


def expo_variant(bounds, hour, wbgt_meta, tair_delta, shade_mask):
    tag = "lo" if tair_delta < 0 else "hi"
    path = c.INTERIM_DIR / f"expo_{tag}_{hour:02d}.tif"
    if path.exists():
        return read_band(path)

    stations = wbgt_meta["stations"]
    shifted = {s: {**v, "tair_c": v["tair_c"] + tair_delta} for s, v in stations.items()}
    tair_grid, tdew_grid, wind_grid, pres_grid = c.station_grids(bounds, shifted)
    lst_field, lst_area_mean, _ = lst.get_uhi_field(bounds)
    tair_grid = lst.apply_uhi(tair_grid, lst_field, lst_area_mean)
    utc_dt = pd.Timestamp(wbgt_meta["utc_datetime_used"])
    ghi_sun = wbgt_meta["ghi_full_sun_wm2"]

    wbgt_sun = c.compute_wbgt_grid(bounds, tair_grid, tdew_grid, wind_grid, pres_grid, ghi_sun, utc_dt)
    if ghi_sun <= 0:
        wbgt_shaded = wbgt_sun.copy()
    else:
        diffuse_fraction = c.COSTS["constants"]["diffuse_fraction_shaded"]["value"]
        wbgt_shaded = c.compute_wbgt_grid(
            bounds, tair_grid, tdew_grid, wind_grid, pres_grid, ghi_sun * diffuse_fraction, utc_dt
        )
    expo = np.where(shade_mask, wbgt_shaded, wbgt_sun).astype(np.float32)

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
    with rasterio.open(path, "w", **profile) as dst:
        dst.write(expo, 1)
    return expo


def segment_name(route, start_dist, end_dist, coords, approach_label, index):
    mid = 0.5 * (start_dist + end_dist)
    cum = 0.0
    name = None
    for i in range(len(coords) - 1):
        seg_len = np.hypot(coords[i + 1][0] - coords[i][0], coords[i + 1][1] - coords[i][1])
        if cum <= mid <= cum + seg_len:
            for edge in route["edge_names"]:
                if edge["start_idx"] <= i <= edge["end_idx"]:
                    name = edge["name"]
                    break
            break
        cum += seg_len
    if name:
        return name, f"{slugify(name)}_{int(round(start_dist))}"
    fallback = f"{approach_label} access path"
    return fallback, f"{slugify(approach_label)}_path_{index}"


def build_segments():
    bounds = c.get_raster_bounds()
    routes = c.compute_routes()
    hours = c.kickoff_hours()
    layers = load_hour_layers(bounds, hours)

    features = []
    for approach, route in routes.items():
        coords = route["coords_utm"]
        line = LineString(coords)
        total_len = line.length
        origin_label = c.CFG["origins"][approach]["label"]
        fans_total = int(round(NRG_CAPACITY * APPROACH_MODE_SHARE.get(approach, 0.0)))

        cuts = list(np.arange(0.0, total_len, SEGMENT_LENGTH_M))
        if not cuts or cuts[-1] < total_len:
            cuts.append(total_len)
        if len(cuts) > 2 and (cuts[-1] - cuts[-2]) < (SEGMENT_LENGTH_M * 0.25):
            cuts.pop(-2)

        for idx in range(len(cuts) - 1):
            start_dist, end_dist = cuts[idx], cuts[idx + 1]
            seg_geom = substring(line, start_dist, end_dist)
            seg_len_m = seg_geom.length
            if seg_len_m <= 0:
                continue

            n_samples = max(2, int(round(seg_len_m / SAMPLE_SPACING_M)) + 1)
            distances = np.linspace(0.0, seg_len_m, n_samples)
            sample_pts = [seg_geom.interpolate(d) for d in distances]
            xs = np.array([p.x for p in sample_pts])
            ys = np.array([p.y for p in sample_pts])
            rows, cols = rowcol(bounds, xs, ys)

            degmin, degmin_lo, degmin_hi, wbgt_out, shade_frac_out = {}, {}, {}, {}, {}
            for hour in hours:
                cells = layers[hour]["expo"][rows, cols]
                cells_lo = layers[hour]["expo_lo"][rows, cols]
                cells_hi = layers[hour]["expo_hi"][rows, cols]
                shaded = layers[hour]["shade"][rows, cols]

                over = np.clip(cells - WBGT_THRESHOLD_C, 0, None).mean()
                over_lo = np.clip(cells_lo - WBGT_THRESHOLD_C, 0, None).mean()
                over_hi = np.clip(cells_hi - WBGT_THRESHOLD_C, 0, None).mean()

                scale = (seg_len_m / WALK_SPEED_MPS) / 60.0
                degmin[str(hour)] = round(float(over * scale), 3)
                degmin_lo[str(hour)] = round(float(min(over, over_lo) * scale), 3)
                degmin_hi[str(hour)] = round(float(max(over, over_hi) * scale), 3)
                wbgt_out[str(hour)] = round(float(cells.mean()), 2)
                shade_frac_out[str(hour)] = round(float(shaded.mean()), 3)

            full_lonlat = [c.utm_to_lonlat(x, y) for x, y in seg_geom.coords]

            name, seg_id = segment_name(route, start_dist, end_dist, coords, origin_label, idx)

            feature = {
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": [list(p) for p in full_lonlat]},
                "properties": {
                    "id": seg_id,
                    "name": name,
                    "len_m": round(float(seg_len_m), 1),
                    "approach": approach,
                    "degmin": degmin,
                    "degmin_lo": degmin_lo,
                    "degmin_hi": degmin_hi,
                    "wbgt": wbgt_out,
                    "shade_frac": shade_frac_out,
                    "fans": fans_total,
                    "svi": 0.0,
                    "canopy_pct": 0.0,
                    "treatable": TREATABLE,
                },
            }
            features.append(feature)

    return {"type": "FeatureCollection", "features": features}


def main():
    c.ensure_dirs()
    fc = build_segments()
    out_path = c.OUT_DIR / "segments.geojson"
    c.write_json(out_path, fc)

    n = len(fc["features"])
    top = max(fc["features"], key=lambda f: f["properties"]["degmin"].get("15", 0.0))
    wbgt_vals = [
        v for f in fc["features"] for v in f["properties"]["wbgt"].values()
    ]
    print(f"segments written: {n}")
    print(f"top ranked segment at hour 15: {top['properties']['name']} ({top['properties']['id']}) degmin {top['properties']['degmin']}")
    print(f"wbgt range across segments and hours: {min(wbgt_vals):.2f} to {max(wbgt_vals):.2f} C")

    c.write_json(
        c.INTERIM_DIR / "segments_meta.json",
        {
            "n_segments": n,
            "wbgt_threshold_c": WBGT_THRESHOLD_C,
            "walk_speed_mps": WALK_SPEED_MPS,
            "segment_length_m": SEGMENT_LENGTH_M,
            "sample_spacing_m": SAMPLE_SPACING_M,
            "path_width_assumption_m": PATH_WIDTH_M,
            "path_width_note": PATH_WIDTH_NOTE,
            "nrg_capacity": NRG_CAPACITY,
            "nrg_capacity_note": NRG_CAPACITY_NOTE,
            "approach_mode_share": APPROACH_MODE_SHARE,
            "mode_share_note": MODE_SHARE_NOTE,
            "treatable_interventions": TREATABLE,
            "svi_note": "social vulnerability index not integrated in this pipeline run, reported as 0.0 pending a real CDC or ATSDR SVI data source",
            "canopy_pct_note": "tree canopy percent not modeled in this pipeline run, reported as 0.0 pending a real canopy raster, the DSM built in s3 covers buildings only",
        },
    )


if __name__ == "__main__":
    main()
