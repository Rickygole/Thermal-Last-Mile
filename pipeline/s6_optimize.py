import sys
from pathlib import Path
from collections import defaultdict

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as c

THRESHOLD_C = c.CFG["walk"]["wbgt_threshold_c"]
WALK_SPEED_MPS = c.CFG["walk"]["speed_mps"]
STEP = c.CFG["optimizer"]["step"]
CAP = c.CFG["optimizer"]["cap"]
METHOD = c.CFG["optimizer"]["method"]
DIFFUSE_FRACTION_SHADED = c.COSTS["constants"]["diffuse_fraction_shaded"]["value"]
PATH_WIDTH_M = 2.0
EXTREME_C = c.CFG["walk"]["wbgt_extreme_c"]
WBGT_SHADED_FLOOR = EXTREME_C - 4.0


def hour_conditions(hour):
    wbgt_meta = c.read_json(c.INTERIM_DIR / f"wbgt_{hour:02d}_meta.json")
    expo_meta = c.read_json(c.INTERIM_DIR / f"expo_{hour:02d}_meta.json")
    tair_mean = float(np.mean([v["tair_c"] for v in wbgt_meta["stations"].values()]))
    tdew_mean = float(np.mean([v["tdew_c"] for v in wbgt_meta["stations"].values()]))
    wind_mean = float(np.mean([v["wind_ms"] for v in wbgt_meta["stations"].values()]))
    pres_mean = float(np.mean([v["pres_hpa"] for v in wbgt_meta["stations"].values()]))
    return {
        "over_sun": max(0.0, wbgt_meta["wbgt_mean_c"] - THRESHOLD_C),
        "over_shade_natural": max(0.0, expo_meta["wbgt_shaded_mean_c"] - THRESHOLD_C),
        "ghi_full_sun": wbgt_meta["ghi_full_sun_wm2"],
        "tair_mean": tair_mean,
        "tdew_mean": tdew_mean,
        "wind_mean": wind_mean,
        "pres_mean": pres_mean,
        "utc_datetime": wbgt_meta["utc_datetime_used"],
    }


def intervention_over(hour_cond, diffuse_transmission):
    site = c.CFG["site"]
    if hour_cond["ghi_full_sun"] <= 0:
        return hour_cond["over_shade_natural"]
    solar = hour_cond["ghi_full_sun"] * diffuse_transmission
    utc_dt = pd.Timestamp(hour_cond["utc_datetime"])
    from metpy.units import units
    from pywbgt import liljegrenWBGT

    out = liljegrenWBGT(
        pd.DatetimeIndex([utc_dt]),
        np.array([site["lat"]]),
        np.array([site["lon"]]),
        np.array([solar]) * units("W/m^2"),
        np.array([hour_cond["pres_mean"]]) * units.hPa,
        np.array([hour_cond["tair_mean"]]) * units.degC,
        np.array([hour_cond["tdew_mean"]]) * units.degC,
        np.array([hour_cond["wind_mean"]]) * units("m/s"),
        d_globe=c.GLOBE_DIAMETER_M * units.m,
    )
    wbgt_val = float(np.asarray(out["Twbg"])[0])
    return max(0.0, wbgt_val - THRESHOLD_C)


def build_candidates(segments, hours_cond, intervention_over_by_hour):
    candidates = []
    for feat in segments:
        p = feat["properties"]
        seg_id = p["id"]
        len_m = p["len_m"]
        fans = p["fans"]
        shade_frac = p["shade_frac"]
        for name in p["treatable"]:
            spec = c.COSTS["interventions"].get(name)
            if spec is None or not spec.get("blocks_direct_beam"):
                continue
            shaded_area = spec.get("shaded_area_m2")
            if not shaded_area:
                continue
            coverage = min(1.0, shaded_area / (len_m * PATH_WIDTH_M))
            cost = spec.get("unit_cost_usd")
            if cost is None:
                continue
            per_hour = {}
            for hour in hours_cond:
                f0 = shade_frac[str(hour)]
                over_sun = hours_cond[hour]["over_sun"]
                over_shade_natural = hours_cond[hour]["over_shade_natural"]
                over_new = intervention_over_by_hour[hour][name]
                per_hour[hour] = {
                    "f0": f0,
                    "over_sun": over_sun,
                    "over_shade_natural": over_shade_natural,
                    "over_new": over_new,
                }
            candidates.append(
                {
                    "segment_id": seg_id,
                    "intervention": name,
                    "coverage": coverage,
                    "cost": float(cost),
                    "len_m": len_m,
                    "fans": fans,
                    "per_hour": per_hour,
                    "degmin_measured": p["degmin"],
                }
            )
    return candidates


def segment_baseline_over_sum(cand):
    total = 0.0
    for hc in cand["per_hour"].values():
        f0 = hc["f0"]
        total += f0 * hc["over_shade_natural"] + (1 - f0) * hc["over_sun"]
    return total


def marginal_gain(cand, used_delta):
    headroom = max(0.0, 1.0 - used_delta)
    delta = min(cand["coverage"], headroom)
    if delta <= 0:
        return 0.0, 0.0, 0.0
    averted_degmin_per_trip = 0.0
    total_over_hours = 0.0
    for hour, hc in cand["per_hour"].items():
        measured = cand["degmin_measured"].get(str(hour), 0.0)
        if measured <= 0:
            continue
        sunlit = max(0.0, 1.0 - hc["f0"])
        if sunlit <= 1e-9:
            continue
        treated_share = min(1.0, delta / sunlit)
        over_sun = hc["over_sun"]
        if over_sun <= 1e-9:
            continue
        residual_ratio = min(1.0, hc["over_new"] / over_sun)
        averted = measured * treated_share * (1.0 - residual_ratio)
        averted_degmin_per_trip += averted
        total_over_hours += averted / max(cand["len_m"] / WALK_SPEED_MPS / 60.0, 1e-9)
    total_degmin = averted_degmin_per_trip * cand["fans"]
    return total_degmin, delta, total_over_hours


def run_greedy(candidates):
    used_delta = defaultdict(float)
    remaining = {i: cand for i, cand in enumerate(candidates)}
    chosen_order = []
    spent = 0.0
    cumulative_averted = 0.0

    while remaining:
        best_idx, best_ratio, best_gain, best_delta = None, -1.0, 0.0, 0.0
        for idx, cand in remaining.items():
            gain, delta, _ = marginal_gain(cand, used_delta[cand["segment_id"]])
            if gain <= 0 or cand["cost"] <= 0:
                continue
            ratio = gain / cand["cost"]
            if ratio > best_ratio:
                best_ratio, best_idx, best_gain, best_delta = ratio, idx, gain, delta
        if best_idx is None:
            break
        cand = remaining.pop(best_idx)
        if spent + cand["cost"] > CAP:
            continue
        used_delta[cand["segment_id"]] += best_delta
        spent += cand["cost"]
        cumulative_averted += best_gain
        chosen_order.append(
            {
                "pair": f"{cand['segment_id']}#{cand['intervention']}",
                "spent_after": spent,
                "cumulative_averted": cumulative_averted,
                "segment_id": cand["segment_id"],
                "fans": cand["fans"],
            }
        )
    return chosen_order


def build_path(chosen_order, candidates, segments_by_id):
    candidates_by_key = {f"{c['segment_id']}#{c['intervention']}": c for c in candidates}
    segment_ids_by_approach = defaultdict(set)
    approach_fans = {}
    for seg_id, props in segments_by_id.items():
        approach = props["approach"]
        segment_ids_by_approach[approach].add(seg_id)
        approach_fans[approach] = props["fans"]

    baseline_over_by_segment = {}
    for seg_id in segments_by_id:
        segs_cands = [c for c in candidates if c["segment_id"] == seg_id]
        if segs_cands:
            baseline_over_by_segment[seg_id] = segment_baseline_over_sum(segs_cands[0])
        else:
            baseline_over_by_segment[seg_id] = 0.0

    budgets = list(range(0, CAP + 1, STEP))
    path = {}
    step_idx = -1
    n_steps = len(chosen_order)
    running_set = []

    for budget in budgets:
        while step_idx + 1 < n_steps and chosen_order[step_idx + 1]["spent_after"] <= budget:
            step_idx += 1
            running_set.append(chosen_order[step_idx]["pair"])
        if step_idx >= 0:
            spent = chosen_order[step_idx]["spent_after"]
            averted = chosen_order[step_idx]["cumulative_averted"]
        else:
            spent = 0.0
            averted = 0.0

        used_delta = defaultdict(float)
        remaining_over = dict(baseline_over_by_segment)
        for pair in running_set:
            cand = candidates_by_key[pair]
            _, delta, over_averted = marginal_gain(cand, used_delta[cand["segment_id"]])
            used_delta[cand["segment_id"]] += delta
            remaining_over[cand["segment_id"]] = max(0.0, remaining_over[cand["segment_id"]] - over_averted)

        touched_approaches = {
            segments_by_id[p.split("#")[0]]["approach"] for p in running_set
        }
        fans_covered = sum(approach_fans[a] for a in touched_approaches)

        extreme_free_approaches = set()
        for a, seg_ids in segment_ids_by_approach.items():
            worst = 0.0
            for s in seg_ids:
                props = segments_by_id[s]
                peak_wbgt = max(props["wbgt"].values())
                if peak_wbgt <= EXTREME_C:
                    continue
                baseline = baseline_over_by_segment.get(s, 0.0)
                if baseline <= 1e-9:
                    continue
                relief = 1.0 - (remaining_over.get(s, 0.0) / baseline)
                treated_peak = peak_wbgt - relief * (peak_wbgt - WBGT_SHADED_FLOOR)
                worst = max(worst, treated_peak - EXTREME_C)
            if worst <= 1e-6:
                extreme_free_approaches.add(a)
        fans_below_threshold = sum(approach_fans[a] for a in extreme_free_approaches)

        path[str(budget)] = {
            "set": list(running_set),
            "averted_degmin": round(averted, 1),
            "averted_per_fan": round(averted / fans_covered, 2) if fans_covered else 0.0,
            "cost_per_degmin": round(spent / averted, 4) if averted else 0.0,
            "fans_below_threshold": int(fans_below_threshold),
            "spent": spent,
        }
    return path


def main():
    c.ensure_dirs()
    fc = c.read_json(c.OUT_DIR / "segments.geojson")
    segments = fc["features"]
    segments_by_id = {f["properties"]["id"]: f["properties"] for f in segments}
    hours = c.kickoff_hours()

    hours_cond = {hour: hour_conditions(hour) for hour in hours}

    shading = [
        name for name, spec in c.COSTS["interventions"].items() if spec.get("blocks_direct_beam")
    ]
    intervention_over_by_hour = {
        hour: {
            name: intervention_over(hours_cond[hour], c.COSTS["interventions"][name]["diffuse_transmission"])
            for name in shading
        }
        for hour in hours
    }

    candidates = build_candidates(segments, hours_cond, intervention_over_by_hour)
    chosen_order = run_greedy(candidates)
    path = build_path(chosen_order, candidates, segments_by_id)

    averted_series = [v["averted_degmin"] for v in path.values()]
    for a, b in zip(averted_series, averted_series[1:]):
        assert b >= a - 1e-9, "averted_degmin curve must be monotone non decreasing"

    solution = {"meta": {"step": STEP, "cap": CAP, "method": METHOD}, "path": path}
    c.write_json(c.OUT_DIR / "solutions.json", solution)

    n_pairs = len(candidates)
    n_chosen_final = len(path[str(CAP)]["set"])
    print(f"candidate pairs: {n_pairs}")
    print(f"budget levels: {len(path)}")
    print(f"pairs chosen at full cap {CAP}: {n_chosen_final}")
    print(f"averted_degmin at full cap: {path[str(CAP)]['averted_degmin']}")
    print(f"averted_degmin monotone non decreasing: confirmed")


if __name__ == "__main__":
    main()
