import sys
from pathlib import Path
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as c
import s6_optimize as s6

THRESHOLD_C = c.CFG["walk"]["wbgt_threshold_c"]
EXTREME_C = c.CFG["walk"]["wbgt_extreme_c"]
BASELINE_HOUR = 15
TREE_NAME = "tree"
CAP = c.CFG["optimizer"]["cap"]

FIXTURE_BINDING_NOTE = (
    "fixture kickoff times for the seven NRG Stadium matches of the 2026 FIFA World Cup are "
    "bound to the verified schedule in config.yml under fixtures, and those matches were played "
    "between 14 June and 4 July 2026, so the fixture hour block below is a retrospective look back at a "
    "decision already executed, not advice about a decision still open. the hour table itself "
    "remains the generalized sweep across the plausible kickoff window, built from each hour's "
    "hottest available match date rather than each match's own observed date, which keeps it "
    "useful for comparing hours in general and for other venues where the kickoff hour has not "
    "yet been decided. it is not the true per match measurement of what fans actually absorbed "
    "at NRG Stadium. that measurement, built from each match's own observed weather and its own "
    "date's sun geometry with a shade mask rebaked per match rather than reused across dates, is "
    "in data/out/retrospective.json, produced by pipeline/s12_retrospective.py."
)

METHOD_NOTE = (
    "fan_hours_above_threshold is total fans multiplied by the fan weighted degree minutes of "
    "wet bulb globe temperature exceedance above walk.wbgt_threshold_c accumulated along the "
    "last mile route, summed across all four approaches and divided by 60. this mirrors the "
    "measure already used elsewhere in this project, and is a degree weighted exposure hour, "
    "not a simple clock hour count, so it is comparable across hours and to the optimizer's "
    "averted_degmin figures by the same divide by 60 conversion."
)

TREE_EQUIVALENCE_NOTE = (
    "equivalent_tree_spend_usd answers a single question: how many dollars of street tree "
    "planting, at the same 2026 year five canopy fraction used by the optimizer's near term "
    "horizon, would be required to remove as much fan_hours_above_threshold at the 15:00 "
    "baseline as is removed for free by moving kickoff to this hour instead. it is computed "
    "from a dedicated tree only greedy allocation across every segment evaluated at 15:00 "
    "conditions, independent of the multi intervention allocation in solutions.json, because "
    "solutions.json mixes sail, tree and awning spend and is not a tree only curve. if no "
    "spend up to the optimizer cap achieves the required removal, that is stated directly and "
    "the figure is not extrapolated past the cap."
)


def load_segments():
    fc = c.read_json(c.OUT_DIR / "segments.geojson")
    return fc["features"]


def approach_groups(features):
    groups = defaultdict(list)
    for f in features:
        groups[f["properties"]["approach"]].append(f["properties"])
    return groups


def fan_hours_above_threshold(features, hour):
    key = str(hour)
    total = sum(p["properties"]["fans"] * p["properties"]["degmin"][key] for p in features)
    return total / 60.0


def degmin_per_trip_by_approach(groups, hour):
    key = str(hour)
    return {
        approach: round(sum(p["degmin"][key] for p in props), 3)
        for approach, props in groups.items()
    }


def fans_crossing_extreme(groups, hour):
    key = str(hour)
    by_approach = {}
    total = 0
    for approach, props in groups.items():
        peak = max(p["wbgt"][key] for p in props)
        crosses = peak > EXTREME_C
        fans = props[0]["fans"] if props else 0
        by_approach[approach] = {
            "peak_segment_wbgt_c": round(peak, 2),
            "crosses_extreme": crosses,
            "fans": fans,
        }
        if crosses:
            total += fans
    return total, by_approach


def build_tree_only_hour15_curve(features):
    hours_cond = {BASELINE_HOUR: s6.hour_conditions(BASELINE_HOUR)}
    shading = [
        name for name, spec in c.COSTS["interventions"].items() if spec.get("blocks_direct_beam")
    ]
    intervention_over_by_hour = {
        BASELINE_HOUR: {
            name: s6.intervention_over(
                hours_cond[BASELINE_HOUR], c.COSTS["interventions"][name]["diffuse_transmission"]
            )
            for name in shading
        }
    }
    candidates = s6.build_candidates(features, hours_cond, intervention_over_by_hour)
    tree_candidates = [cand for cand in candidates if cand["intervention"] == TREE_NAME]

    scored = []
    for cand in tree_candidates:
        gain, _, _ = s6.marginal_gain(cand, 0.0, "coverage_near_term")
        if gain <= 0 or cand["cost"] <= 0:
            continue
        scored.append((gain / cand["cost"], gain, cand["cost"]))
    scored.sort(key=lambda t: t[0], reverse=True)

    curve = [(0.0, 0.0)]
    spend, averted = 0.0, 0.0
    for _, gain, cost in scored:
        if spend + cost > CAP:
            continue
        spend += cost
        averted += gain
        curve.append((spend, averted))
    return curve


def equivalent_tree_spend(curve, target_fan_hours, hour):
    if hour == BASELINE_HOUR:
        return {
            "usd": 0.0,
            "achieved_fan_hours_removed": 0.0,
            "note": "this is the 15:00 baseline itself, there is no shift to price",
        }
    if target_fan_hours <= 1e-6:
        return {
            "usd": 0.0,
            "achieved_fan_hours_removed": 0.0,
            "note": (
                "this hour is not an improvement over the 15:00 baseline, so no capital spend at "
                "15:00 is needed to match it, shifting to this hour buys no free reduction"
            ),
        }
    for spend, averted in curve:
        if averted / 60.0 >= target_fan_hours:
            return {
                "usd": round(spend, 2),
                "achieved_fan_hours_removed": round(averted / 60.0, 1),
            }
    max_spend, max_averted = curve[-1]
    return {
        "usd": None,
        "max_tree_spend_modeled_usd": round(max_spend, 2),
        "max_fan_hours_removable_by_trees_at_that_spend": round(max_averted / 60.0, 1),
        "note": (
            f"no modeled tree only spend up to the optimizer cap of {CAP} usd removes the full "
            f"{target_fan_hours:.1f} fan hour reduction that shifting kickoff away from 15:00 "
            "achieves for free. not extrapolated beyond the modeled cap, treat this hour's "
            "capital equivalent as unresolved rather than inventing a number past the cap."
        ),
    }



def scheduled_block(hour_rows):
    fixtures = c.CFG.get("fixtures")
    if not fixtures or not fixtures.get("matches"):
        return None
    matches = []
    total = 0.0
    for m in fixtures["matches"]:
        h = str(m["kickoff_local_hour"])
        row = hour_rows.get(h)
        if row is None:
            continue
        fh = row["fan_hours_above_threshold"]
        total += fh
        matches.append(
            {
                "date": str(m["date"]),
                "kickoff_local_hour": m["kickoff_local_hour"],
                "stage": m.get("stage"),
                "label": m.get("label"),
                "fan_hours_above_threshold": round(fh, 1),
            }
        )
    if not matches:
        return None
    best_hour = min(hour_rows, key=lambda k: hour_rows[k]["fan_hours_above_threshold"])
    best_val = hour_rows[best_hour]["fan_hours_above_threshold"]
    alt_total = best_val * len(matches)
    removed = total - alt_total
    return {
        "warning": (
            "this block is NOT a tournament total. it stamps every match with the hour "
            "sweep value for its kickoff hour, and the sweep uses one representative date "
            "per hour, so a noon match in mid June carries a late June or July day's "
            "weather. the measured tournament total, computed against each match's own "
            "observed weather, is in data/out/retrospective.json and is the only figure "
            "that should appear in any headline position."
        ),
        "source": fixtures.get("source"),
        "verified_utc": fixtures.get("verified_utc"),
        "schedule_status_note": (
            "these matches have already been played, this block is a retrospective evaluation "
            "of the kickoff hours they were actually assigned, using this stage's generalized "
            "hour sweep (each hour's hottest available match date), not each match's own "
            "observed weather. see data/out/retrospective.json for the true per match "
            "measurement, produced by pipeline/s12_retrospective.py."
        ),
        "volatility_note": fixtures.get("note"),
        "matches": matches,
        "sweep_sum_at_fixture_hours_not_a_tournament_total": round(total, 1),
        "n_matches": len(matches),
        "n_matches_at_worst_scheduled_hour": sum(
            1 for m in matches if str(m["kickoff_local_hour"]) == max(
                {str(x["kickoff_local_hour"]) for x in matches},
                key=lambda k: hour_rows[k]["fan_hours_above_threshold"],
            )
        ),
        "counterfactual_all_at_hour": int(best_hour),
        "sweep_counterfactual_sum": round(alt_total, 1),
        "removed_by_rescheduling_fan_hours": round(removed, 1),
        "removed_by_rescheduling_fraction": round(removed / total, 4) if total else None,
        "statement": (
            f"moving kickoff from {BASELINE_HOUR}:00 to {best_hour}:00 removes all modelled "
            f"exposure ABOVE the {THRESHOLD_C} C threshold on the last mile to NRG Stadium, at zero "
            "capital cost, since it is a scheduling decision rather than an infrastructure "
            "spend. this is not the same as removing all heat. the metric counts only the "
            "excess above the threshold, so an hour whose peak wet bulb globe temperature "
            "falls just under the line reports zero while still carrying a real thermal "
            "load. the reduction is sensitive to where the threshold is drawn, and the "
            "threshold sensitivity is reported in the validation document."
        ),
    }


def main():
    c.ensure_dirs()
    features = load_segments()
    groups = approach_groups(features)
    hours = c.kickoff_hours()

    fan_hours = {hour: fan_hours_above_threshold(features, hour) for hour in hours}
    baseline_fan_hours = fan_hours[BASELINE_HOUR]

    tree_curve = build_tree_only_hour15_curve(features)

    tree_spec = c.COSTS["interventions"][TREE_NAME]
    coverage_note = c.read_json(c.OUT_DIR / "solutions.json").get("meta", {}).get(
        "coverage_horizon_note", ""
    )

    hour_table = {}
    for hour in hours:
        total_crossing, by_approach_crossing = fans_crossing_extreme(groups, hour)
        removed_fraction = (
            round(1.0 - fan_hours[hour] / baseline_fan_hours, 4) if baseline_fan_hours > 0 else 0.0
        )
        target_removal = max(0.0, baseline_fan_hours - fan_hours[hour])
        hour_table[str(hour)] = {
            "fan_hours_above_threshold": round(fan_hours[hour], 1),
            "fans_crossing_extreme": {
                "total": total_crossing,
                "by_approach": by_approach_crossing,
            },
            "degmin_per_trip_by_approach": degmin_per_trip_by_approach(groups, hour),
            "exposure_removed_vs_1500": removed_fraction,
            "equivalent_tree_spend_usd": equivalent_tree_spend(tree_curve, target_removal, hour),
        }

    best_hour = min(hours, key=lambda h: fan_hours[h])
    worst_hour = max(hours, key=lambda h: fan_hours[h])
    free_reduction_fraction = hour_table[str(best_hour)]["exposure_removed_vs_1500"]
    free_reduction_fan_hours = round(baseline_fan_hours - fan_hours[best_hour], 1)

    max_tree_spend, max_tree_averted = tree_curve[-1]
    tree_only_ceiling = {
        "max_tree_only_spend_usd": round(max_tree_spend, 2),
        "max_fan_hours_removable_at_15_00": round(max_tree_averted / 60.0, 1),
        "note": (
            "this is the ceiling of the dedicated tree only curve, one tree credited per "
            "eligible segment at the near term 2026 canopy fraction, evaluated at 15:00 "
            "conditions. it is the most fan hour relief street trees can buy at 15:00 under "
            "this model even with unlimited budget, since coverage per segment cannot exceed "
            "one treated width. compare this to free_reduction_available_fan_hours below."
        ),
    }

    summary = {
        "baseline_hour": BASELINE_HOUR,
        "best_hour": best_hour,
        "best_hour_fan_hours_above_threshold": round(fan_hours[best_hour], 1),
        "worst_hour": worst_hour,
        "worst_hour_fan_hours_above_threshold": round(fan_hours[worst_hour], 1),
        "free_reduction_available_fraction": free_reduction_fraction,
        "free_reduction_available_fan_hours": free_reduction_fan_hours,
        "statement": (
            f"moving kickoff from {BASELINE_HOUR}:00 to {best_hour}:00 removes "
            f"{free_reduction_fraction * 100:.1f} percent of the modelled exposure ABOVE the "
            f"{THRESHOLD_C} C wet bulb globe temperature threshold on the last mile to NRG "
            f"Stadium, at zero capital cost, since it is a scheduling decision rather than an "
            f"infrastructure spend. this is not the same as removing all heat. the metric "
            f"counts only the excess above the threshold, so an hour whose peak falls just "
            f"under the line reports zero while still carrying a real thermal load, and the "
            f"reduction is sensitive to where the threshold is drawn."
        ),
        "threshold_sensitivity_note": (
            "the reported reduction depends on the threshold. drawn at a lower reference "
            "temperature the same schedule change removes a smaller share, because more of "
            "the day's load is counted. the 28 C action limit used here sits on a steep part "
            "of that curve, so this figure should be read as threshold conditional rather "
            "than as an absolute removal of heat exposure."
        ),
        "tree_reference_unit_cost_usd": tree_spec.get("unit_cost_usd"),
        "tree_coverage_horizon_used": "coverage_near_term (year 5 canopy fraction), see coverage_horizon_note",
        "tree_only_ceiling_at_1500": tree_only_ceiling,
    }

    out = {
        "generated_utc": c.now_iso(),
        "wbgt_threshold_c": THRESHOLD_C,
        "wbgt_extreme_c": EXTREME_C,
        "modeled_hours": [str(h) for h in hours],
        "fixture_binding_note": FIXTURE_BINDING_NOTE,
        "method_note": METHOD_NOTE,
        "tree_equivalence_note": TREE_EQUIVALENCE_NOTE,
        "coverage_horizon_note": coverage_note,
        "hours": hour_table,
        "summary": summary,
        "hour_sweep_at_fixture_hours_illustrative": scheduled_block(hour_table),
    }

    c.write_json(c.OUT_DIR / "kickoff_clock.json", out)

    print("kickoff_clock.json written")
    for hour in hours:
        row = hour_table[str(hour)]
        print(
            f"  {hour:02d}:00  fan_hours_above_threshold={row['fan_hours_above_threshold']:>10}  "
            f"removed_vs_1500={row['exposure_removed_vs_1500']:.3f}  "
            f"tree_equiv={row['equivalent_tree_spend_usd'].get('usd')}"
        )
    print(f"best hour: {best_hour}, worst hour: {worst_hour}")
    print(summary["statement"])


if __name__ == "__main__":
    main()
