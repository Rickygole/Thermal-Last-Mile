import sys
import math
from pathlib import Path
from collections import defaultdict

import numpy as np
from shapely.geometry import LineString
from shapely.ops import substring

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as c
import lst_houston as lst
import s2_wbgt as s2
import s3_shadow as s3
import s4_surface as s4
import s5_routes as s5

THRESHOLD_C = c.CFG["walk"]["wbgt_threshold_c"]
EXTREME_C = c.CFG["walk"]["wbgt_extreme_c"]
SEGMENT_LENGTH_M = c.CFG["walk"]["segment_length_m"]
SAMPLE_SPACING_M = c.CFG["walk"]["sample_spacing_m"]
WALK_SPEED_MPS = c.CFG["walk"]["speed_mps"]
MAX_MARCH_STEPS = c.CFG["raster"]["max_march_steps"]
ALTERNATE_EVENING_HOUR = 19

METHOD_NOTE = (
    "this stage measures the seven NRG Stadium matches of the 2026 FIFA World Cup that were "
    "actually played between 14 June and 4 July 2026, each at its own kickoff date and hour, "
    "rather than sweeping a hypothetical kickoff window or substituting the hottest available "
    "match date for a given hour, which is what pipeline/s10_kickoff.py's hour sweep still does "
    "and is a design condition choice appropriate to forecasting, not to measuring a past event. "
    "for every match this stage fetches the observed ASOS meteorology at KHOU, KIAH and KSGR for "
    "that match's own date and hour, couples it to the Landsat land surface temperature field "
    "used elsewhere in this project for spatial urban heat island structure, rebakes the "
    "pedestrian shade mask for that match's own date and hour using true solar geometry, and "
    "walks the same four last mile approaches used elsewhere in this project to accumulate wet "
    "bulb globe temperature degree minutes above walk.wbgt_threshold_c. fan_degree_hours_above_"
    "threshold is fans on that approach multiplied by degree minutes accumulated on that "
    "approach's own last mile route, summed across the four approaches and divided by 60, the "
    "same measure used throughout this project."
)

SHADE_REBAKE_NOTE = (
    "the shade masks cached under data/interim/shade_HH.tif are keyed only by hour of day and "
    "were baked for whichever match date the hour sweep in pipeline/s10_kickoff.py and "
    "pipeline/s2_wbgt.py judged hottest for that hour, so reusing them here would silently mix "
    "one match's sun geometry into another match's date. solar declination moves across 14 June "
    "to 4 July 2026, so this stage instead reruns the same building shadow raymarch from "
    "pipeline/s3_shadow.py fresh for each match's own date and kickoff hour, on the same cached "
    "digital surface model everything else in this project uses. rebaking measured about half a "
    "second per match on this raster, cheap enough to do honestly rather than approximate, so no "
    "hour keyed shade mask from the generalized sweep is reused anywhere in this stage."
)

LST_PROXY_NOTE = (
    "the Landsat land surface temperature field used to spatially couple the urban heat island "
    "signal is the same single warm season composite used throughout this project, built from "
    "late morning satellite overpasses and applied as a spatial anomaly on top of each match's "
    "own observed air temperature, not a same time observation of surface temperature for that "
    "match. see data/raw/landsat/lst_field.json for the scenes pooled into that composite. this "
    "is an identical, already documented approximation across all seven matches, not something "
    "new introduced by measuring matches individually instead of sweeping hours."
)

WEATHER_UNAVAILABLE_NOTE = (
    "if the Iowa Environmental Mesonet ASOS archive could not return a usable observation at all "
    "three stations for a match's own date and kickoff hour, that match is reported with "
    "weather_status unavailable and excluded from the tournament total and the counterfactual, "
    "rather than having its exposure estimated from a different date's weather."
)

COUNTERFACTUAL_NOTE = (
    "six of the seven matches kicked off at 12:00 local and one at 19:00 local. this evaluation "
    "asks how much of the measured exposure at the six noon matches would not have occurred had "
    "each kicked off at 19:00 local instead, holding every other condition, including the date "
    "and that date's own observed weather, fixed. it recomputes each noon match's own date at "
    "hour 19 using the same observed ASOS fetch, urban heat island coupling and rebaked shade "
    "mask method used for the actual measurement above, then compares that alternate hour "
    "computation to the actual noon measurement for the same six matches, leaving the one match "
    "that was actually played at 19:00 unchanged in both totals. this isolates the effect of "
    "kickoff hour alone, holding weather at that date's observed values, so it is an estimate of "
    "the schedule effect and not a full simulation of an alternate tournament. it does not model "
    "second order effects a real schedule change could have had, such as different attendance, "
    "different fan arrival patterns, or a different broadcast slot. because the schedule that "
    "produced the observed conditions has already been executed, this is reported as a "
    "measurement of what that scheduling choice cost, not as a recommendation to reschedule "
    "matches that have already been played. the same method applies directly to a venue where "
    "the kickoff decision is still open, where it would be a forward looking design condition "
    "choice rather than a retrospective one."
)


def rowcol(bounds, xs, ys):
    return s5.rowcol(bounds, xs, ys)


def build_route_points(bounds, routes):
    rows_list, cols_list, starts, scales, approaches = [], [], [], [], []
    n_points = 0
    for approach, route in routes.items():
        coords = route["coords_utm"]
        line = LineString(coords)
        total_len = line.length
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
            approaches.append(approach)
            n_points += rows.size
    return {
        "rows": np.concatenate(rows_list),
        "cols": np.concatenate(cols_list),
        "starts": np.array(starts),
        "scales": np.array(scales),
        "approaches": approaches,
    }


def fetch_station_stats(date_str, hour):
    stations = list(c.ASOS_STATIONS.keys())
    stats, missing = {}, []
    for station in stations:
        try:
            obs = c.station_hour_obs(station, date_str, hour)
        except Exception as exc:
            obs = None
        if obs is None:
            missing.append(station)
        else:
            stats[station] = obs
    return stats, missing


def station_mean(station_stats):
    return {
        "tair_c": round(float(np.mean([v["tair_c"] for v in station_stats.values()])), 2),
        "tdew_c": round(float(np.mean([v["tdew_c"] for v in station_stats.values()])), 2),
        "wind_ms": round(float(np.mean([v["wind_ms"] for v in station_stats.values()])), 2),
        "wind_ms_10m": round(float(np.mean([v["wind_ms_10m"] for v in station_stats.values()])), 2),
        "pres_hpa": round(float(np.mean([v["pres_hpa"] for v in station_stats.values()])), 2),
        "wind_ms_used_by_model": round(
            float(np.mean([v.get("wind_ms_used_by_model", v["wind_ms"]) for v in station_stats.values()])), 3
        ),
        "n_stations_reporting_calm": int(
            sum(1 for v in station_stats.values() if v.get("wind_reported_calm"))
        ),
    }


def evaluate_conditions(bounds, lst_field, lst_area_mean, dsm, pad_cells, route_points, date_str, hour):
    station_stats, missing = fetch_station_stats(date_str, hour)
    if missing:
        return None, missing

    tair_grid, tdew_grid, wind_grid, pres_grid = c.station_grids(bounds, station_stats)
    tair_grid = lst.apply_uhi(tair_grid, lst_field, lst_area_mean)
    ghi = s2.clearsky_ghi(date_str, hour)
    utc_dt = s2.hour_to_utc_naive(date_str, hour)
    azimuth, elevation = s3.sun_position(hour, date_str)
    shaded_full = s3.raymarch_shade(dsm, pad_cells, bounds, azimuth, elevation, MAX_MARCH_STEPS)

    lon_grid, lat_grid = c.grid_centers_lonlat(bounds)
    rows_all = route_points["rows"]
    cols_all = route_points["cols"]

    lat_pts = lat_grid[rows_all, cols_all].astype(np.float64)
    lon_pts = lon_grid[rows_all, cols_all].astype(np.float64)
    tair_pts = tair_grid[rows_all, cols_all].astype(np.float64)
    tdew_pts = tdew_grid[rows_all, cols_all].astype(np.float64)
    wind_pts = wind_grid[rows_all, cols_all].astype(np.float64)
    pres_pts = pres_grid[rows_all, cols_all].astype(np.float64)
    shaded_pts = shaded_full[rows_all, cols_all]

    wbgt_sun_pts, wbgt_shade_pts = s4.wbgt_sun_and_shade(
        utc_dt, lat_pts, lon_pts, ghi, pres_pts, tair_pts, tdew_pts, wind_pts
    )
    exposure_pts = np.where(shaded_pts, wbgt_shade_pts, wbgt_sun_pts).astype(np.float64)

    return {
        "station_stats": station_stats,
        "station_mean": station_mean(station_stats),
        "ghi_full_sun_wm2": round(float(ghi), 1),
        "utc_datetime_used": str(utc_dt),
        "sun_azimuth_deg": round(float(azimuth), 2),
        "sun_elevation_deg": round(float(elevation), 2),
        "shaded_fraction_site": round(float(shaded_full.mean()), 4),
        "shaded_fraction_route": round(float(shaded_pts.mean()), 4),
        "exposure_pts": exposure_pts,
    }, []


def aggregate_by_approach(route_points, exposure_pts):
    starts = route_points["starts"]
    scales = route_points["scales"]
    approaches = route_points["approaches"]
    counts = np.diff(np.append(starts, exposure_pts.size)).astype(np.float64)
    over = np.clip(exposure_pts - THRESHOLD_C, 0.0, None)
    seg_over_mean = np.add.reduceat(over, starts) / counts
    seg_wbgt_mean = np.add.reduceat(exposure_pts, starts) / counts
    degmin_by_seg = seg_over_mean * scales

    degmin_by_approach = defaultdict(float)
    peak_by_approach = defaultdict(lambda: -math.inf)
    for i, approach in enumerate(approaches):
        degmin_by_approach[approach] += float(degmin_by_seg[i])
        peak_by_approach[approach] = max(peak_by_approach[approach], float(seg_wbgt_mean[i]))
    return dict(degmin_by_approach), dict(peak_by_approach)


def fan_exposure(degmin_by_approach, peak_by_approach):
    fans_by_approach = {a: int(round(s5.NRG_CAPACITY * s5.APPROACH_MODE_SHARE.get(a, 0.0))) for a in degmin_by_approach}
    fan_degree_hours = sum(
        fans_by_approach[a] * degmin_by_approach[a] / 60.0 for a in degmin_by_approach
    )
    crossing = {}
    total_crossing_fans = 0
    for a, peak in peak_by_approach.items():
        crosses = peak > EXTREME_C
        crossing[a] = {
            "peak_segment_wbgt_c": round(peak, 2),
            "crosses_extreme": bool(crosses),
            "fans": fans_by_approach[a],
        }
        if crosses:
            total_crossing_fans += fans_by_approach[a]
    return fan_degree_hours, fans_by_approach, {"total": total_crossing_fans, "by_approach": crossing}


def build_match_record(fixture, bounds, lst_field, lst_area_mean, dsm, pad_cells, route_points):
    date_str = str(fixture["date"])
    hour = int(fixture["kickoff_local_hour"])
    conditions, missing = evaluate_conditions(bounds, lst_field, lst_area_mean, dsm, pad_cells, route_points, date_str, hour)

    record = {
        "date": date_str,
        "kickoff_local_hour": hour,
        "stage": fixture.get("stage"),
        "label": fixture.get("label"),
    }

    if conditions is None:
        record["weather_status"] = "unavailable"
        record["unavailable_reason"] = (
            f"no usable ASOS observation at all of {missing} for {date_str} hour {hour}, "
            "this match's exposure was not estimated from a substitute date"
        )
        return record, None

    degmin_by_approach, peak_by_approach = aggregate_by_approach(route_points, conditions["exposure_pts"])
    fan_degree_hours, fans_by_approach, crossing = fan_exposure(degmin_by_approach, peak_by_approach)

    record.update(
        {
            "weather_status": "observed",
            "stations": conditions["station_stats"],
            "observed_conditions_mean": conditions["station_mean"],
            "ghi_full_sun_wm2": conditions["ghi_full_sun_wm2"],
            "utc_datetime_used": conditions["utc_datetime_used"],
            "sun_azimuth_deg": conditions["sun_azimuth_deg"],
            "sun_elevation_deg": conditions["sun_elevation_deg"],
            "shaded_fraction_site": conditions["shaded_fraction_site"],
            "shaded_fraction_route": conditions["shaded_fraction_route"],
            "fans_by_approach": fans_by_approach,
            "degmin_per_trip_by_approach": {a: round(v, 3) for a, v in degmin_by_approach.items()},
            "fan_degree_hours_above_threshold": round(fan_degree_hours, 2),
            "fans_crossing_extreme": crossing,
        }
    )
    return record, fan_degree_hours


def build_tournament_total(matches, fan_degree_hours_by_date):
    measured = [m for m in matches if m["weather_status"] == "observed"]
    unavailable = [m for m in matches if m["weather_status"] != "observed"]
    total = sum(fan_degree_hours_by_date[m["date"]] for m in measured)
    coverage_note = ""
    if unavailable:
        coverage_note = (
            f" weather could not be retrieved for {len(unavailable)} of {len(matches)} matches "
            f"({', '.join(m['date'] for m in unavailable)}), so this total covers only the "
            f"{len(measured)} matches with observed weather and is a partial tournament total, "
            "not the full seven match figure."
        )
    return {
        "n_matches_total": len(matches),
        "n_matches_measured": len(measured),
        "n_matches_unavailable": len(unavailable),
        "unavailable_dates": [m["date"] for m in unavailable],
        "tournament_total_fan_degree_hours_above_threshold": round(total, 1),
        "statement": (
            f"across the {len(measured)} NRG Stadium World Cup matches with usable observed "
            f"weather, fans accumulated {round(total):,} fan degree hours above the "
            f"{THRESHOLD_C} C wet bulb globe temperature threshold on the last mile to the "
            "stadium during the 14 June to 4 July 2026 tournament window. this is what actually "
            "happened, measured from each match's own observed meteorology and own date sun "
            f"geometry, not a hypothetical design condition sweep.{coverage_note}"
        ),
    }


def build_counterfactual(fixtures, bounds, lst_field, lst_area_mean, dsm, pad_cells, route_points, matches_by_date):
    noon_matches = [f for f in fixtures if int(f["kickoff_local_hour"]) != ALTERNATE_EVENING_HOUR]
    evening_matches = [f for f in fixtures if int(f["kickoff_local_hour"]) == ALTERNATE_EVENING_HOUR]

    per_match = []
    included_actual_total = 0.0
    included_counterfactual_total = 0.0

    for fixture in noon_matches:
        date_str = str(fixture["date"])
        actual = matches_by_date[date_str]
        if actual["weather_status"] != "observed":
            per_match.append(
                {
                    "date": date_str,
                    "kickoff_local_hour": int(fixture["kickoff_local_hour"]),
                    "status": "excluded_actual_weather_unavailable",
                }
            )
            continue

        alt_conditions, missing = evaluate_conditions(
            bounds, lst_field, lst_area_mean, dsm, pad_cells, route_points, date_str, ALTERNATE_EVENING_HOUR
        )
        actual_fdh = actual["fan_degree_hours_above_threshold"]
        if alt_conditions is None:
            per_match.append(
                {
                    "date": date_str,
                    "kickoff_local_hour": int(fixture["kickoff_local_hour"]),
                    "actual_fan_degree_hours_above_threshold": actual_fdh,
                    "status": f"excluded_no_observed_weather_at_{ALTERNATE_EVENING_HOUR}_00_on_this_date",
                }
            )
            continue

        alt_degmin, alt_peak = aggregate_by_approach(route_points, alt_conditions["exposure_pts"])
        alt_fdh, _, _ = fan_exposure(alt_degmin, alt_peak)

        included_actual_total += actual_fdh
        included_counterfactual_total += alt_fdh
        per_match.append(
            {
                "date": date_str,
                "kickoff_local_hour": int(fixture["kickoff_local_hour"]),
                "actual_fan_degree_hours_above_threshold": round(actual_fdh, 2),
                "counterfactual_evening_fan_degree_hours_above_threshold": round(alt_fdh, 2),
                "difference": round(actual_fdh - alt_fdh, 2),
                "status": "included",
            }
        )

    for fixture in evening_matches:
        date_str = str(fixture["date"])
        actual = matches_by_date[date_str]
        if actual["weather_status"] == "observed":
            included_actual_total += actual["fan_degree_hours_above_threshold"]
            included_counterfactual_total += actual["fan_degree_hours_above_threshold"]

    removed = included_actual_total - included_counterfactual_total
    removed_fraction = round(removed / included_actual_total, 4) if included_actual_total else None
    n_included = sum(1 for p in per_match if p["status"] == "included") + len(
        [f for f in evening_matches if matches_by_date[str(f["date"])]["weather_status"] == "observed"]
    )

    if removed >= 0:
        cost_statement = (
            f"of the {round(included_actual_total):,} fan degree hours measured across the "
            f"{n_included} matches usable in this comparison, {round(removed):,} "
            f"({round(100 * removed_fraction, 1) if removed_fraction is not None else 'n/a'} "
            "percent) would not have occurred had the noon matches instead kicked off at "
            f"{ALTERNATE_EVENING_HOUR}:00 local, holding each date's own observed weather fixed. "
            "that is what the noon scheduling actually cost on the last mile, as measured after "
            "the fact, not a recommendation to change a schedule that has already been played."
        )
    else:
        cost_statement = (
            f"across the {n_included} matches usable in this comparison, kicking the noon "
            f"matches off at {ALTERNATE_EVENING_HOUR}:00 local instead, holding each date's own "
            "observed weather fixed, would have added "
            f"{round(-removed):,} fan degree hours rather than removed them. on the dates this "
            "tournament actually drew, the observed noon weather was not uniformly worse than "
            "the observed evening weather, and this result is reported as measured rather than "
            "smoothed to match the expected direction."
        )

    return {
        "note": COUNTERFACTUAL_NOTE,
        "alternate_hour": ALTERNATE_EVENING_HOUR,
        "per_match": per_match,
        "totals": {
            "n_matches_included": n_included,
            "actual_total_fan_degree_hours_above_threshold": round(included_actual_total, 1),
            "counterfactual_total_fan_degree_hours_above_threshold": round(included_counterfactual_total, 1),
            "removed_fan_degree_hours": round(removed, 1),
            "removed_fraction": removed_fraction,
        },
        "statement": cost_statement,
        "forward_looking_note": (
            "the tournament at NRG Stadium is over and this section evaluates a decision already "
            "made. the same fetch, couple, rebake and walk method used above applies unchanged to "
            "any venue where the kickoff hour has not yet been decided, where it would inform a "
            "design condition choice rather than measure one already taken."
        ),
    }



def match_hour_validation():
    rows = []
    for m in c.CFG["fixtures"]["matches"]:
        date_str, hour = str(m["date"]), int(m["kickoff_local_hour"])
        obs = {}
        for st in c.ASOS_STATIONS:
            o = c.station_hour_obs(st, date_str, hour)
            if o:
                obs[st] = o
        if len(obs) < 3:
            continue
        for target in obs:
            others = {k: v for k, v in obs.items() if k != target}
            tl = c.ASOS_STATIONS[target]
            num = den = 0.0
            for k, v in others.items():
                s2 = c.ASOS_STATIONS[k]
                dist = np.hypot(
                    (s2["lat"] - tl["lat"]) * 111320.0,
                    (s2["lon"] - tl["lon"]) * 111320.0 * np.cos(np.radians(tl["lat"])),
                )
                w = 1.0 / max(dist, 1.0) ** 2
                num += w * v["tair_c"]
                den += w
            rows.append(num / den - obs[target]["tair_c"])
    if not rows:
        return None
    e = np.array(rows)
    return {
        "quantity_validated": "air temperature",
        "rmse_c": round(float(np.sqrt((e ** 2).mean())), 2),
        "bias_c": round(float(e.mean()), 2),
        "max_abs_error_c": round(float(np.abs(e).max()), 2),
        "n_samples": int(e.size),
        "n_stations": 3,
        "scope": "the seven real match kickoff hours that produce the tournament total, which is the validation that applies to the headline",
        "note": "the wider figure reported in meta.json validation covers the hour sweep across its selected dates, not these match hours. this figure is the one that applies to the retrospective, and it is the larger of the two, so it is reported here rather than left to be inferred",
    }

def main():
    c.ensure_dirs()
    fixtures_cfg = c.CFG.get("fixtures")
    if not fixtures_cfg or not fixtures_cfg.get("matches"):
        raise RuntimeError("pipeline/config.yml has no fixtures.matches block to measure against")
    fixtures = fixtures_cfg["matches"]

    bounds = c.get_raster_bounds()
    routes = c.compute_routes()
    route_points = build_route_points(bounds, routes)
    lst_field, lst_area_mean, _ = lst.get_uhi_field(bounds)
    margin_m = MAX_MARCH_STEPS * c.CFG["raster"]["resolution_m"]
    dsm, pad_cells = s3.build_dsm(bounds, margin_m)

    matches = []
    fan_degree_hours_by_date = {}
    matches_by_date = {}
    for fixture in fixtures:
        record, fan_degree_hours = build_match_record(
            fixture, bounds, lst_field, lst_area_mean, dsm, pad_cells, route_points
        )
        matches.append(record)
        matches_by_date[record["date"]] = record
        if fan_degree_hours is not None:
            fan_degree_hours_by_date[record["date"]] = fan_degree_hours
        print(
            f"{record['date']} {record['kickoff_local_hour']:02d}:00 {record['stage']}: "
            + (
                f"fan_degree_hours_above_threshold={record['fan_degree_hours_above_threshold']}"
                if record["weather_status"] == "observed"
                else f"weather unavailable, {record['unavailable_reason']}"
            )
        )

    tournament_total = build_tournament_total(matches, fan_degree_hours_by_date)
    counterfactual = build_counterfactual(
        fixtures, bounds, lst_field, lst_area_mean, dsm, pad_cells, route_points, matches_by_date
    )

    out = {
        "generated_utc": c.now_iso(),
        "wbgt_threshold_c": THRESHOLD_C,
        "wbgt_extreme_c": EXTREME_C,
        "fixtures_source": fixtures_cfg.get("source"),
        "fixtures_verified_utc": fixtures_cfg.get("verified_utc"),
        "method_note": METHOD_NOTE,
        "shade_rebake_note": SHADE_REBAKE_NOTE,
        "lst_proxy_note": LST_PROXY_NOTE,
        "weather_unavailable_note": WEATHER_UNAVAILABLE_NOTE,
        "matches": matches,
        "match_hour_validation": match_hour_validation(),
        "tournament_total": tournament_total,
        "counterfactual_evening_kickoff": counterfactual,
    }

    c.write_json(c.OUT_DIR / "retrospective.json", out)

    print("retrospective.json written")
    print(tournament_total["statement"])
    print(counterfactual["statement"])


if __name__ == "__main__":
    main()
