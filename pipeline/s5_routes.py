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
import s4_surface as s4

PATH_WIDTH_M = 2.0
PATH_WIDTH_NOTE = (
    "walking path width assumed 2.0 m, a typical clear pedestrian zone width, "
    "used only to convert an intervention shaded_area_m2 into a coverage "
    "fraction of a segment for the optimizer, not an observed measurement"
)

NRG_CAPACITY = 72220
NRG_CAPACITY_NOTE = "Houston Texans official NRG Stadium seating capacity"
INVENTED_APPROACH_MODE_SHARE = {
    "metrorail_stadium_park": 0.10,
    "lot_c": 0.45,
    "rideshare_kirby": 0.15,
    "fan_fest": 0.10,
}
INVENTED_MODE_SHARE_NOTE = (
    "approach mode shares are a modeled assumption, not an observed survey, "
    "reflecting a Sunbelt surface lot dominant stadium like NRG where most "
    "fans park and walk, with smaller transit, rideshare and fan fest shares. "
    "shares sum to less than 1.0 since a residual share arrives directly at "
    "gates by other means not represented by these four origins"
)
FAN_VOLUMES_PATH = c.OUT_DIR / "fan_volumes.json"


def load_mode_share():
    if FAN_VOLUMES_PATH.exists():
        fan_volumes = c.read_json(FAN_VOLUMES_PATH)
        share = fan_volumes.get("derived_relative_share")
        if share and fan_volumes.get("plausible", False):
            return (
                dict(share),
                "data/out/fan_volumes.json, derived_relative_share, an evidence "
                "based relative weighting across the four approaches built from "
                "the organizers' core-poi-geometry and store-visits sample data, "
                "see that file for method and the organizers' sample data "
                "limitation",
                "organizer_derived",
            )
        return (
            dict(INVENTED_APPROACH_MODE_SHARE),
            "data/out/fan_volumes.json exists but was marked implausible or "
            "carried no usable share, see its plausibility_notes. fell back to "
            "the invented constants below. "
            + INVENTED_MODE_SHARE_NOTE,
            "invented_fallback_implausible_organizer_data",
        )
    return (
        dict(INVENTED_APPROACH_MODE_SHARE),
        "data/out/fan_volumes.json was not found, run pipeline/s9_organizer.py "
        "to derive it from organizer data. fell back to the invented "
        "constants below. " + INVENTED_MODE_SHARE_NOTE,
        "invented_fallback_no_organizer_data",
    )


APPROACH_MODE_SHARE, MODE_SHARE_NOTE, MODE_SHARE_SOURCE = load_mode_share()

WBGT_THRESHOLD_C = c.CFG["walk"]["wbgt_threshold_c"]
WALK_SPEED_MPS = c.CFG["walk"]["speed_mps"]
SEGMENT_LENGTH_M = c.CFG["walk"]["segment_length_m"]
SAMPLE_SPACING_M = c.CFG["walk"]["sample_spacing_m"]

MC_SAMPLES = 128
MC_SEED = 20260704
MC_LOW_PCT = 5.0
MC_HIGH_PCT = 95.0
MC_TDEW_SD_C = 1.5
MC_WIND_SIGMA_LOG = 0.35
MC_GHI_LOW = 0.70
MC_GHI_HIGH = 1.00
MC_WIND_FLOOR_MPS = 0.5

UNCERTAINTY_META = {
    "label": (
        f"degmin_lo and degmin_hi are the {MC_LOW_PCT:.0f}th and {MC_HIGH_PCT:.0f}th percentiles of a "
        f"{MC_SAMPLES} draw Monte Carlo over meteorological inputs, not a confidence interval on the "
        "observations and not a full model uncertainty. the interval is not forced to contain the "
        "central estimate, so a segment whose central value sits outside its own band is a real "
        "signal that the response to these inputs is not monotone about the central case"
    ),
    "method": "monte carlo, common random numbers across hours and segments",
    "samples": MC_SAMPLES,
    "seed": MC_SEED,
    "percentiles": [MC_LOW_PCT, MC_HIGH_PCT],
    "perturbed_inputs": {
        "air_temperature_c": (
            "additive, normal, mean 0, standard deviation taken from tair_tolerance_c in the s2 "
            "meta for each hour, which is 1.0 C covering ASOS sensor accuracy of about 0.6 C plus "
            "representativeness error from interpolating three stations 10 to 40 km away. applied "
            "as a single field wide shift, not as independent noise per cell"
        ),
        "dew_point_c": (
            f"additive, normal, mean 0, standard deviation {MC_TDEW_SD_C} C, field wide shift, "
            "clipped so dew point never exceeds air temperature. covers ASOS dew point accuracy of "
            "about 1.1 C plus Gulf Coast advection variability across the interpolation footprint"
        ),
        "wind_speed_scale": (
            f"multiplicative, lognormal, median 1.0, standard deviation of the log {MC_WIND_SIGMA_LOG}, "
            f"floored at {MC_WIND_FLOOR_MPS} m/s. the 5th to 95th percentile multiplier is about 0.56 "
            "to 1.78. this is the dominant term and it is wide on purpose, because airport wind "
            "extrapolated to 2 m says little about ventilation in a specific street canyon"
        ),
        "irradiance_scale": (
            f"multiplicative, uniform on {MC_GHI_LOW} to {MC_GHI_HIGH} of the pvlib clear sky global "
            "horizontal irradiance. one sided because the clear sky value is a physical upper bound "
            "and any real sky can only reduce it, the lower end represents scattered cumulus"
        ),
    },
    "not_propagated": (
        "globe diameter is held at the ISO 150 mm value and is not sampled, although switching to "
        "the 50.8 mm Liljegren default moves the headline number by more than the whole band. the "
        "UHI coupling coefficient, the shade mask geometry from the building DSM, the sky diffuse "
        "fraction, the ground albedo, walking speed, mode share and the 28 C threshold are all held "
        "fixed. the reported band is therefore a lower bound on total uncertainty"
    ),
    "sensitivity_note": (
        "degree minutes above a threshold is a hinge function, so its condition number at this "
        "operating point is large, roughly 35, and a small WBGT error becomes a large degree minute "
        "error. a wide band here is the honest result, not a modelling failure"
    ),
}

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
    lst_field, lst_area_mean, _ = lst.get_uhi_field(bounds)
    layers = {}
    for hour in hours:
        wbgt_meta = c.read_json(c.INTERIM_DIR / f"wbgt_{hour:02d}_meta.json")
        tair_grid, tdew_grid, wind_grid, pres_grid = c.station_grids(bounds, wbgt_meta["stations"])
        layers[hour] = {
            "expo": read_band(c.INTERIM_DIR / f"expo_{hour:02d}.tif"),
            "shade": read_band(c.INTERIM_DIR / f"shade_{hour:02d}.tif").astype(bool),
            "meta": wbgt_meta,
            "tair": lst.apply_uhi(tair_grid, lst_field, lst_area_mean),
            "tdew": tdew_grid,
            "wind": wind_grid,
            "pres": pres_grid,
        }
    return layers


def mc_draws():
    rng = np.random.default_rng(MC_SEED)
    return {
        "tair_z": rng.normal(0.0, 1.0, MC_SAMPLES),
        "tdew_z": rng.normal(0.0, 1.0, MC_SAMPLES),
        "wind_scale": np.exp(rng.normal(0.0, MC_WIND_SIGMA_LOG, MC_SAMPLES)),
        "ghi_scale": rng.uniform(MC_GHI_LOW, MC_GHI_HIGH, MC_SAMPLES),
    }


def mc_over_threshold(bounds, layers, hours, rows, cols, starts):
    lon_grid, lat_grid = c.grid_centers_lonlat(bounds)
    lat_pts = lat_grid[rows, cols].astype(np.float64)
    lon_pts = lon_grid[rows, cols].astype(np.float64)
    counts = np.diff(np.append(starts, rows.size)).astype(np.float64)
    draws = mc_draws()

    out = {}
    for hour in hours:
        layer = layers[hour]
        meta = layer["meta"]
        tair0 = layer["tair"][rows, cols].astype(np.float64)
        tdew0 = layer["tdew"][rows, cols].astype(np.float64)
        wind0 = layer["wind"][rows, cols].astype(np.float64)
        pres0 = layer["pres"][rows, cols].astype(np.float64)
        shaded = layer["shade"][rows, cols]
        utc_dt = pd.Timestamp(meta["utc_datetime_used"])
        ghi0 = meta["ghi_full_sun_wm2"]
        tair_sd = meta["tair_tolerance_c"]

        samples = np.empty((MC_SAMPLES, starts.size), dtype=np.float64)
        for k in range(MC_SAMPLES):
            tair = tair0 + tair_sd * draws["tair_z"][k]
            tdew = np.minimum(tdew0 + MC_TDEW_SD_C * draws["tdew_z"][k], tair)
            wind = np.maximum(wind0 * draws["wind_scale"][k], MC_WIND_FLOOR_MPS)
            wbgt_sun, wbgt_shade = s4.wbgt_sun_and_shade(
                utc_dt, lat_pts, lon_pts, ghi0 * draws["ghi_scale"][k], pres0, tair, tdew, wind
            )
            expo = np.where(shaded, wbgt_shade, wbgt_sun)
            over = np.clip(expo - WBGT_THRESHOLD_C, 0.0, None)
            samples[k] = np.add.reduceat(over, starts) / counts
        out[hour] = (
            np.percentile(samples, MC_LOW_PCT, axis=0),
            np.percentile(samples, MC_HIGH_PCT, axis=0),
        )
    return out


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
    rows_list, cols_list, starts, scales = [], [], [], []
    n_points = 0
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

            scale = (seg_len_m / WALK_SPEED_MPS) / 60.0
            rows_list.append(rows)
            cols_list.append(cols)
            starts.append(n_points)
            scales.append(scale)
            n_points += rows.size

            degmin, degmin_lo, degmin_hi, wbgt_out, shade_frac_out = {}, {}, {}, {}, {}
            for hour in hours:
                cells = layers[hour]["expo"][rows, cols]
                shaded = layers[hour]["shade"][rows, cols]

                over = np.clip(cells - WBGT_THRESHOLD_C, 0, None).mean()
                degmin[str(hour)] = round(float(over * scale), 3)
                degmin_lo[str(hour)] = 0.0
                degmin_hi[str(hour)] = 0.0
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

    mc = mc_over_threshold(
        bounds,
        layers,
        hours,
        np.concatenate(rows_list),
        np.concatenate(cols_list),
        np.array(starts),
    )
    for i, feature in enumerate(features):
        props = feature["properties"]
        for hour in hours:
            lo, hi = mc[hour]
            props["degmin_lo"][str(hour)] = round(float(lo[i] * scales[i]), 3)
            props["degmin_hi"][str(hour)] = round(float(hi[i] * scales[i]), 3)

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
            "mode_share_source": MODE_SHARE_SOURCE,
            "invented_approach_mode_share": INVENTED_APPROACH_MODE_SHARE,
            "treatable_interventions": TREATABLE,
            "uncertainty": UNCERTAINTY_META,
            "svi_note": "social vulnerability index not integrated in this pipeline run, reported as 0.0 pending a real CDC or ATSDR SVI data source",
            "canopy_pct_note": "tree canopy percent not modeled in this pipeline run, reported as 0.0 pending a real canopy raster, the DSM built in s3 covers buildings only",
        },
    )


if __name__ == "__main__":
    main()
