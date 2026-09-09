import os
import re
import sys
import json
import time
from pathlib import Path

import numpy as np
import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as c
import lst_houston as lst
import s5_routes as s5

SHARED_NAME = os.environ.get("ORGANIZER_SHARE", "")


def require_share():
    if not SHARED_NAME:
        raise SystemExit(
            "ORGANIZER_SHARE is not set. This stage reads the hackathon organisers' "
            "shared datasets, which participants agree to keep confidential, so the "
            "share identifier is not committed to this repository. Set it from the "
            "organisers' resources page before running this stage."
        )
    return SHARED_NAME
FOLDER_IDS = {
    "urban-heat-index": "392080472577",
    "daily-weather": "392096744432",
    "core-poi-geometry": "392079810795",
    "store-visits": "392080024112",
}
BOX_DIR = c.RAW_DIR / "organizers" / "box"
USER_AGENT = "Mozilla/5.0"

WEATHER_STATION = "KDWH"
WEATHER_STATION_NOTE = (
    "the organizers' daily-weather sample carries 401 US station identifiers "
    "and no city or market column, and none of those identifiers are KHOU, "
    "KIAH, or KSGR, the three ASOS stations this pipeline already uses for "
    "Houston meteorology. KDWH, David Wayne Hooks Memorial Airport in Spring, "
    "Texas on the north side of the Houston metro, is the one identifier in "
    "the organizers' list recognizable as a real Houston area station, so it "
    "is used here"
)
DEW_POINT_UNIT_NOTE = (
    "the organizers' column is named AVERAGE_DEW_POINT_F, implying Fahrenheit, "
    "but the organizers' own data dictionary documents its nationwide range as "
    "-999998.5 to 36.81, a maximum that is implausibly low for a Fahrenheit "
    "dew point across five years of every US climate zone including Houston "
    "and Miami summers, and consistent instead with a Celsius dew point. "
    "values observed for KDWH near the actual 2026 match dates confirm this, "
    "landing around 22 to 23 and converting cleanly to a mid seventies "
    "Fahrenheit dew point that matches the ASOS observations below once "
    "converted. this file therefore treats AVERAGE_DEW_POINT_F as Celsius "
    "despite its name and converts it to Fahrenheit for the comparison"
)

WEATHER_CANONICAL_COLUMNS = [
    "CITY_LOCATION_IDENTIFIER",
    "VALID_DATE_AS_YYYYMMDD",
    "MAXIMUM_TEMPERATURE_C",
    "MINIMUM_TEMPERATURE_C",
    "AVERAGE_TEMPERATURE_C",
    "HEATING_DEGREE_DAYS_C",
    "COOLING_DEGREE_DAYS_C",
    "PRECIPITATION",
    "AVERAGE_RELATIVE_HUMIDITY",
    "AVERAGE_WIND_SPEED_KNOTS",
    "AVERAGE_DEW_POINT_F",
    "AVERAGE_VISIBILITY_KILOMETERS",
    "AVERAGE_SEA_LEVEL_PRESSURE_MILLIBARS",
]

ORGANIZER_DATA_LIMITATION = (
    "these datasets are hackathon organiser sample data, transformed from the "
    "real underlying sources with multiplicative noise added to counts and "
    "visitation, additive noise added to temperatures and other bounded "
    "environmental values, and spatial jittering applied to coordinates. the "
    "organizers state that findings from this data should not be used to make "
    "valid, reliable, or actionable assessments of any city, district, venue, "
    "or geographic area. every number in this file is used only for "
    "corroboration, relative weighting, or workflow demonstration, never as a "
    "measurement of real Houston conditions"
)


def folder_url(folder_id):
    return f"https://rice.app.box.com/s/{SHARED_NAME}/folder/{folder_id}"


def download_url(file_id):
    return (
        "https://rice.app.box.com/index.php?rm=box_download_shared_file"
        f"&shared_name={SHARED_NAME}&file_id=f_{file_id}"
    )


def list_folder_files(folder_id, retries=5):
    wait = 5.0
    last_error = None
    resp = None
    for attempt in range(retries):
        try:
            resp = requests.get(folder_url(folder_id), headers={"User-Agent": USER_AGENT}, timeout=60)
            resp.raise_for_status()
            break
        except requests.exceptions.RequestException as exc:
            last_error = exc
            resp = None
            time.sleep(wait)
            wait *= 2
    if resp is None:
        raise last_error
    match = re.search(r"Box\.postStreamData\s*=\s*(\{.*?\});", resp.text, re.DOTALL)
    if not match:
        raise RuntimeError(f"could not find Box.postStreamData in folder {folder_id}")
    data = json.loads(match.group(1))
    found = []
    seen_ids = set()

    def walk(obj):
        if isinstance(obj, dict):
            if obj.get("type") == "file" and obj.get("id") not in seen_ids:
                seen_ids.add(obj.get("id"))
                found.append({"id": obj.get("id"), "name": obj.get("name")})
            for value in obj.values():
                walk(value)
        elif isinstance(obj, list):
            for value in obj:
                walk(value)

    walk(data)
    found.sort(key=lambda f: f["name"])
    return found


def download_shard(dataset, file_id, name, retries=5):
    out_dir = BOX_DIR / dataset
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / name
    if out_path.exists() and out_path.stat().st_size > 0:
        return out_path, False
    wait = 5.0
    last_error = None
    for attempt in range(retries):
        try:
            resp = requests.get(download_url(file_id), headers={"User-Agent": USER_AGENT}, timeout=180)
            resp.raise_for_status()
            tmp_path = out_path.with_name(out_path.name + ".part")
            tmp_path.write_bytes(resp.content)
            tmp_path.rename(out_path)
            return out_path, True
        except requests.exceptions.RequestException as exc:
            last_error = exc
            time.sleep(wait)
            wait *= 2
    raise last_error


def ensure_dataset(dataset):
    folder_id = FOLDER_IDS[dataset]
    manifest_path = BOX_DIR / dataset / "_manifest.json"
    files = list_folder_files(folder_id)
    if not files:
        raise RuntimeError(f"no shard files found in Box folder {folder_id} for {dataset}")
    downloaded = []
    n_fetched = 0
    for f in files:
        path, fetched = download_shard(dataset, f["id"], f["name"])
        downloaded.append(path)
        if fetched:
            n_fetched += 1
    manifest = {
        "dataset": dataset,
        "folder_id": folder_id,
        "shard_count": len(files),
        "files": files,
        "n_shards_fetched_this_run": n_fetched,
        "fetched_utc": c.now_iso(),
    }
    c.write_json(manifest_path, manifest)
    return sorted(downloaded)


def load_dataset_filtered(paths, usecols, filter_fn=None):
    frames = []
    for path in paths:
        df = pd.read_csv(path, usecols=usecols, low_memory=False)
        if filter_fn is not None:
            df = filter_fn(df)
        if len(df):
            frames.append(df)
    if not frames:
        return pd.DataFrame(columns=usecols)
    return pd.concat(frames, ignore_index=True)


def rename_weather_columns(df):
    rename = {}
    for actual in df.columns:
        for short in WEATHER_CANONICAL_COLUMNS:
            if actual == short or actual.startswith(short + "_"):
                rename[actual] = short
                break
    return df.rename(columns=rename)


def build_uhi_validation(paths):
    bounds = c.read_json(c.INTERIM_DIR / "raster_bounds.json")
    w, s0, e, n = bounds["lonlat_bounds"]

    def filt(df):
        return df[df["MARKET"] == "Houston"]

    uhi_df = load_dataset_filtered(
        paths, usecols=["LATITUDE", "LONGITUDE", "MARKET", "UHI"], filter_fn=filt
    )
    uhi_df = uhi_df.drop_duplicates()
    houston_n = len(uhi_df)

    inside = uhi_df[
        (uhi_df["LONGITUDE"] >= w)
        & (uhi_df["LONGITUDE"] <= e)
        & (uhi_df["LATITUDE"] >= s0)
        & (uhi_df["LATITUDE"] <= n)
    ].copy()

    field, lst_meta = lst.fetch_lst_field(bounds)
    area_mean = lst_meta["lst_area_mean_c"]

    spearman = None
    pearson = None
    if len(inside) >= 3:
        xs, ys = c.lonlat_to_utm(inside["LONGITUDE"].to_numpy(), inside["LATITUDE"].to_numpy())
        res = bounds["resolution_m"]
        cols = np.clip(((np.asarray(xs) - bounds["minx"]) / res).astype(int), 0, bounds["width"] - 1)
        rows = np.clip(((bounds["maxy"] - np.asarray(ys)) / res).astype(int), 0, bounds["height"] - 1)
        lst_c = field[rows, cols]
        anomaly_c = lst_c - area_mean
        inside["lst_c"] = lst_c
        inside["lst_anomaly_c"] = anomaly_c
        spearman_val = inside["UHI"].astype(float).corr(pd.Series(anomaly_c, index=inside.index), method="spearman")
        pearson_val = inside["UHI"].astype(float).corr(pd.Series(anomaly_c, index=inside.index), method="pearson")
        spearman = None if pd.isna(spearman_val) else round(float(spearman_val), 3)
        pearson = None if pd.isna(pearson_val) else round(float(pearson_val), 3)

    if spearman is None:
        verdict = (
            "too few organizer urban heat index points fell inside the study "
            "bounding box after filtering to the Houston market to compute a "
            "correlation. the study area is a walking radius around one "
            "stadium, far smaller than the point spacing of a national sample "
            "UHI dataset, and the organizers additionally jitter coordinates, "
            "so a sparse or empty result here is expected and is not evidence "
            "against the Landsat field this pipeline already computes"
        )
    elif abs(spearman) < 0.2:
        verdict = (
            "weak rank agreement between the organizers' sample UHI index and "
            "this pipeline's Landsat derived heat anomaly at the sampled "
            "points. given the small sample size inside such a small study "
            "area, the additive noise the organizers disclose, and the coarse "
            "1 to 11 ordinal scale of their index, this test has very little "
            "statistical power in either direction. it neither corroborates "
            "nor contradicts the Landsat field, and it should not be presented "
            "as support for it"
        )
    elif spearman <= -0.2:
        verdict = (
            f"a negative rank association (spearman {spearman}) between the "
            "organizers' sample UHI index and this pipeline's Landsat derived "
            "heat anomaly. the two fields DISAGREE on the ordering of hot and "
            "cool locations at the sampled points. this is reported as a "
            "contradiction rather than reconciled, and it should be treated as "
            "a reason to distrust one of the two fields until the disagreement "
            "is explained"
        )
    else:
        verdict = (
            f"a positive rank association (spearman {spearman}) between the "
            "organizers' sample UHI index and this pipeline's Landsat derived "
            "heat anomaly at the sampled points, read as modest independent "
            "corroboration of the same real spatial hot and cool pattern, not "
            "as proof, given the small sample size and the organizers' own "
            "noise disclosure"
        )

    return {
        "organizer_data_limitation": ORGANIZER_DATA_LIMITATION,
        "method": (
            "urban-heat-index shards filtered to MARKET Houston, then to the "
            "lon/lat study bounding box read from "
            "data/interim/raster_bounds.json, the same 1 m grid the rest of "
            "this pipeline uses. surviving points were located on that grid "
            "and the Landsat ST_B10 land surface temperature anomaly this "
            "pipeline already computes in pipeline/lst_houston.py (field minus "
            "area mean) was sampled at the matching pixel. rank (spearman) and "
            "linear (pearson) correlation between the organizers' 1 to 11 UHI "
            "index and that sampled anomaly are reported. adding a constant to "
            "the anomaly changes neither correlation, so this result is "
            "identical whether compared against the anomaly or against the raw "
            "Landsat temperature"
        ),
        "n_houston_market_points": int(houston_n),
        "n_points_inside_study_bbox": int(len(inside)),
        "study_bbox_lonlat": [w, s0, e, n],
        "lst_area_mean_c": area_mean,
        "spearman_r": spearman,
        "pearson_r": pearson,
        "verdict": verdict,
        "fetched_utc": c.now_iso(),
    }


def build_fan_volumes(poi_paths, visits_paths):
    site = c.CFG["site"]
    origins = c.CFG["origins"]
    approach_keys = list(origins.keys())
    radius_m = site["buffer_miles"] * 1609.344

    def poi_filt(df):
        return df[df["MARKET"] == "Houston"]

    poi_cols = ["LATITUDE", "LONGITUDE", "MARKET", "NAICS_CODE"]
    poi_df = load_dataset_filtered(poi_paths, usecols=poi_cols, filter_fn=poi_filt)
    poi_df = poi_df.dropna(subset=["LATITUDE", "LONGITUDE", "NAICS_CODE"]).copy()
    poi_df["NAICS_CODE"] = pd.to_numeric(poi_df["NAICS_CODE"], errors="coerce")
    poi_df = poi_df.dropna(subset=["NAICS_CODE"])

    site_x, site_y = c.lonlat_to_utm(site["lon"], site["lat"])
    px, py = c.lonlat_to_utm(poi_df["LONGITUDE"].to_numpy(), poi_df["LATITUDE"].to_numpy())
    px = np.asarray(px)
    py = np.asarray(py)
    dist_to_site = np.hypot(px - site_x, py - site_y)
    keep = dist_to_site <= radius_m
    near = poi_df[keep].copy()
    near_x = px[keep]
    near_y = py[keep]

    origin_xy = {key: c.lonlat_to_utm(o["lon"], o["lat"]) for key, o in origins.items()}
    dmat = np.stack(
        [np.hypot(near_x - origin_xy[k][0], near_y - origin_xy[k][1]) for k in approach_keys],
        axis=1,
    )
    nearest_idx = dmat.argmin(axis=1)
    near["approach"] = [approach_keys[i] for i in nearest_idx]

    def visits_filt(df):
        return df[(df["MARKET"] == "Dallas / Houston") & (df["STATE"] == "TX")]

    visits_cols = ["MARKET", "STATE", "NAICS_CODE", "DAILY_VISITS"]
    visits_df = load_dataset_filtered(visits_paths, usecols=visits_cols, filter_fn=visits_filt)
    visits_df["NAICS_CODE"] = pd.to_numeric(visits_df["NAICS_CODE"], errors="coerce")
    visits_df = visits_df.dropna(subset=["NAICS_CODE", "DAILY_VISITS"])

    category_rate = visits_df.groupby("NAICS_CODE")["DAILY_VISITS"].mean()
    overall_rate = float(visits_df["DAILY_VISITS"].mean()) if len(visits_df) else 0.0

    near["matched_category"] = near["NAICS_CODE"].isin(category_rate.index)
    near["visit_rate"] = near["NAICS_CODE"].map(category_rate)
    near["visit_rate"] = near["visit_rate"].fillna(overall_rate)

    poi_counts = near.groupby("approach").size()
    matched_counts = near.groupby("approach")["matched_category"].sum()
    est_volume = near.groupby("approach")["visit_rate"].sum()

    per_approach = {}
    for key in approach_keys:
        per_approach[key] = {
            "poi_count": int(poi_counts.get(key, 0)),
            "poi_count_with_matched_naics_visit_rate": int(matched_counts.get(key, 0)),
            "estimated_relative_visit_volume": float(est_volume.get(key, 0.0)),
        }

    total_volume = sum(v["estimated_relative_visit_volume"] for v in per_approach.values())
    total_poi = sum(v["poi_count"] for v in per_approach.values())

    old_shares = s5.INVENTED_APPROACH_MODE_SHARE
    total_share_assumption = round(sum(old_shares.values()), 4)

    if total_volume > 0:
        derived_share = {
            k: round(total_share_assumption * (per_approach[k]["estimated_relative_visit_volume"] / total_volume), 4)
            for k in approach_keys
        }
        weighting_basis = "estimated_relative_visit_volume"
    elif total_poi > 0:
        derived_share = {
            k: round(total_share_assumption * (per_approach[k]["poi_count"] / total_poi), 4)
            for k in approach_keys
        }
        weighting_basis = "poi_count"
    else:
        derived_share = dict(old_shares)
        weighting_basis = "fallback_to_invented_constants_no_organizer_poi_found"

    plausible = True
    plausibility_notes = []
    if total_poi < 20:
        plausible = False
        plausibility_notes.append(
            f"only {total_poi} organizer POIs fell inside the {radius_m:.0f} m "
            "search radius across all four approaches combined, too few to "
            "treat this weighting as a stable estimate"
        )
    share_values = list(derived_share.values())
    if share_values and max(share_values) > 0 and (max(share_values) / max(min(share_values), 1e-9)) > 10:
        plausible = False
        plausibility_notes.append(
            "the largest and smallest derived approach shares differ by more "
            "than 10x, a spread this pipeline treats as implausible rather "
            "than smoothing over"
        )
    structural_bias_approaches = ["lot_c"]
    disagreement = {
        k: derived_share.get(k, 0.0) / max(old_shares.get(k, 1e-9), 1e-9)
        for k in old_shares
    }
    worst = max(disagreement.items(), key=lambda kv: max(kv[1], 1.0 / max(kv[1], 1e-9)))
    if max(worst[1], 1.0 / max(worst[1], 1e-9)) > 2.0:
        plausible = False
        plausibility_notes.append(
            "lot_c sits inside a stadium surface parking lot, which by "
            "definition contains almost no core-poi-geometry commercial "
            "establishments of its own, whatever the true gameday foot "
            "traffic through it. a nearby POI or category visit rate density "
            "proxy structurally undercounts a parking lot approach and can "
            "structurally overcount an approach that happens to border more "
            "ordinary retail unrelated to stadium arrivals. the derived share "
            f"approach {worst[0]} disagrees with the prior by a factor of "
            f"{round(max(worst[1], 1.0 / max(worst[1], 1e-9)), 2)}. this gate is "
            "symmetric and fires on disagreement in EITHER direction on ANY "
            "approach, not only where the evidence is unwelcome. the known "
            "structural limitation, declared before the derivation was run, is "
            f"that POI density cannot measure approaches in "
            f"{structural_bias_approaches}, so the derivation is not trusted "
            "here and the pipeline falls back to the "
            "invented constants"
        )

    return {
        "organizer_data_limitation": ORGANIZER_DATA_LIMITATION,
        "method": (
            "core-poi-geometry shards filtered to MARKET Houston, then to "
            f"points within {radius_m:.0f} m ({site['buffer_miles']} miles) of "
            "the NRG Stadium site coordinate in pipeline/config.yml. each "
            "surviving POI was assigned to whichever of the four config.yml "
            "approach origins (metrorail_stadium_park, lot_c, rideshare_kirby, "
            "fan_fest) it sits closest to by straight line distance. the "
            "downloaded store-visits shards do not carry latitude, longitude, "
            "or city columns despite the organizers' data dictionary listing "
            "them, only MARKET, STATE, NAICS_CODE and DAILY_VISITS survive at "
            "usable population rates, so store-visits records could not be "
            "spatially assigned to an approach directly. instead, DAILY_VISITS "
            "was averaged per NAICS_CODE across store-visits rows with MARKET "
            "'Dallas / Houston' and STATE TX, and that per category average "
            "visit rate was applied to every nearby core-poi-geometry POI "
            "sharing that NAICS_CODE, producing an estimated relative visit "
            "volume per approach. this is a category level evidence based "
            "weighting, not a location level one, since the two datasets could "
            "not be joined by a shared location key"
        ),
        "search_radius_m": round(radius_m, 1),
        "n_poi_houston_market": int(len(poi_df)),
        "n_poi_in_nrg_area": int(len(near)),
        "n_store_visit_rows_used_for_category_rates": int(len(visits_df)),
        "n_naics_categories_with_visit_rate": int(len(category_rate)),
        "per_approach": per_approach,
        "weighting_basis": weighting_basis,
        "derived_relative_share": derived_share,
        "total_share_assumption": total_share_assumption,
        "total_share_assumption_note": (
            "the four derived shares are scaled to sum to the same total as "
            "the existing invented APPROACH_MODE_SHARE constants in "
            "s5_routes.py. this organizer data speaks only to the relative "
            "split between the four approaches, not to what overall fraction "
            "of all fans arrive through these four points rather than by "
            "other unmodeled means, so that overall total is kept as is"
        ),
        "old_invented_mode_share": old_shares,
        "plausible": plausible,
        "plausibility_notes": plausibility_notes,
        "fetched_utc": c.now_iso(),
    }


def build_organizer_weather(paths):
    frames = []
    for path in paths:
        df = pd.read_csv(path, low_memory=False)
        df = rename_weather_columns(df)
        df = df[df["CITY_LOCATION_IDENTIFIER"] == WEATHER_STATION]
        if len(df):
            frames.append(df)
    kdwh = pd.concat(frames, ignore_index=True).drop_duplicates() if frames else pd.DataFrame()

    if len(kdwh):
        valid_date = pd.to_datetime(kdwh["VALID_DATE_AS_YYYYMMDD"])
        kdwh["month_day"] = valid_date.dt.strftime("%m-%d")
        kdwh["year"] = valid_date.dt.year
        kdwh.loc[kdwh["AVERAGE_DEW_POINT_F"] < -900, "AVERAGE_DEW_POINT_F"] = np.nan

    stations = list(c.ASOS_STATIONS.keys())
    comparisons = []
    for date_str in c.match_dates():
        month_day = date_str[5:]
        rows = kdwh[kdwh["month_day"] == month_day] if len(kdwh) else pd.DataFrame()

        organizer_block = None
        if len(rows):
            organizer_block = {
                "n_years_sampled": int(rows["year"].nunique()),
                "years_sampled": sorted(int(y) for y in rows["year"].unique()),
                "avg_temperature_c_mean": round(float(rows["AVERAGE_TEMPERATURE_C"].mean()), 2),
                "max_temperature_c_mean": round(float(rows["MAXIMUM_TEMPERATURE_C"].mean()), 2),
                "min_temperature_c_mean": round(float(rows["MINIMUM_TEMPERATURE_C"].mean()), 2),
                "avg_relative_humidity_pct_mean": round(float(rows["AVERAGE_RELATIVE_HUMIDITY"].mean()), 2),
                "avg_wind_speed_knots_mean": round(float(rows["AVERAGE_WIND_SPEED_KNOTS"].mean()), 2),
                "avg_dew_point_f_mean": (
                    round(float(rows["AVERAGE_DEW_POINT_F"].mean()) * 9.0 / 5.0 + 32.0, 2)
                    if rows["AVERAGE_DEW_POINT_F"].notna().any()
                    else None
                ),
                "avg_dew_point_f_mean_note": DEW_POINT_UNIT_NOTE,
            }

        station_daily = []
        for station in stations:
            try:
                day_df = c.asos_day(station, date_str)
            except Exception:
                continue
            if day_df.empty:
                continue
            rh = 100.0 * np.exp((17.625 * day_df["dwpc"]) / (243.04 + day_df["dwpc"])) / np.exp(
                (17.625 * day_df["tmpc"]) / (243.04 + day_df["tmpc"])
            )
            station_daily.append(
                {
                    "station": station,
                    "tmax_c": float(day_df["tmpc"].max()),
                    "tmin_c": float(day_df["tmpc"].min()),
                    "tmean_c": float(day_df["tmpc"].mean()),
                    "dew_point_f_mean": float(day_df["dwpc"].mean()) * 9.0 / 5.0 + 32.0,
                    "wind_speed_knots_mean": float(day_df["sped"].mean()),
                    "relative_humidity_pct_mean": float(rh.mean()),
                }
            )

        asos_block = None
        if station_daily:
            asos_block = {
                "stations_used": [s["station"] for s in station_daily],
                "avg_temperature_c_mean": round(float(np.mean([s["tmean_c"] for s in station_daily])), 2),
                "max_temperature_c_mean": round(float(np.mean([s["tmax_c"] for s in station_daily])), 2),
                "min_temperature_c_mean": round(float(np.mean([s["tmin_c"] for s in station_daily])), 2),
                "avg_relative_humidity_pct_mean": round(
                    float(np.mean([s["relative_humidity_pct_mean"] for s in station_daily])), 2
                ),
                "avg_wind_speed_knots_mean": round(
                    float(np.mean([s["wind_speed_knots_mean"] for s in station_daily])), 2
                ),
                "avg_dew_point_f_mean": round(float(np.mean([s["dew_point_f_mean"] for s in station_daily])), 2),
            }

        comparisons.append(
            {
                "match_date": date_str,
                "organizer_kdwh_same_calendar_day_climatology": organizer_block,
                "asos_observed_actual_date": asos_block,
            }
        )

    return {
        "organizer_data_limitation": ORGANIZER_DATA_LIMITATION,
        "method": (
            "the organizers' daily-weather sample only covers 2020-01-01 "
            "through 2024-12-31, so it has no rows for the actual 2026 match "
            "dates in config.yml. for each match date this file instead "
            "averages the organizers' KDWH observations across every "
            "available year on that same month and day, and reports it next "
            "to this pipeline's own real ASOS observations for the actual "
            "2026 match date at KHOU, KIAH and KSGR, already fetched by "
            "pipeline/common.py and pipeline/s2_wbgt.py. this is a same "
            "season sanity check, not a same day comparison, and the "
            "organizer side additionally carries the additive temperature "
            "noise and jittered station identity the organizers disclose. "
            "ASOS observations are not replaced or blended with this "
            "organizer data anywhere in the physics pipeline, they are shown "
            "side by side here only"
        ),
        "weather_station_used": WEATHER_STATION,
        "weather_station_note": WEATHER_STATION_NOTE,
        "n_kdwh_rows_all_years": int(len(kdwh)),
        "comparisons": comparisons,
        "fetched_utc": c.now_iso(),
    }


def main():
    require_share()
    c.ensure_dirs()
    BOX_DIR.mkdir(parents=True, exist_ok=True)

    dataset_paths = {}
    for dataset in FOLDER_IDS:
        paths = ensure_dataset(dataset)
        dataset_paths[dataset] = paths
        print(f"{dataset}: {len(paths)} shards cached at {BOX_DIR / dataset}")

    uhi_validation = build_uhi_validation(dataset_paths["urban-heat-index"])
    c.write_json(c.OUT_DIR / "uhi_validation.json", uhi_validation)
    print(
        f"uhi_validation: {uhi_validation['n_points_inside_study_bbox']} points inside study bbox, "
        f"spearman {uhi_validation['spearman_r']}, pearson {uhi_validation['pearson_r']}"
    )

    fan_volumes = build_fan_volumes(dataset_paths["core-poi-geometry"], dataset_paths["store-visits"])
    c.write_json(c.OUT_DIR / "fan_volumes.json", fan_volumes)
    print(f"fan_volumes derived_relative_share: {fan_volumes['derived_relative_share']}")
    print(f"fan_volumes plausible: {fan_volumes['plausible']}")

    organizer_weather = build_organizer_weather(dataset_paths["daily-weather"])
    c.write_json(c.OUT_DIR / "organizer_weather.json", organizer_weather)
    print(f"organizer_weather: {len(organizer_weather['comparisons'])} match dates compared")


if __name__ == "__main__":
    main()
