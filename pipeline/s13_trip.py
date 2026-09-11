import sys
import math
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as c
import lst_houston as lst
import s3_shadow as s3
import s12_retrospective as s12

TRIP_CFG = c.CFG["trip"]
ARRIVAL_WINDOW_MINUTES = int(TRIP_CFG["arrival_window_minutes"])
ARRIVAL_WINDOW_SENSITIVITY_MINUTES = [int(m) for m in TRIP_CFG["arrival_window_sensitivity_minutes"]]
ARRIVAL_DENSITY_SHAPE = TRIP_CFG["arrival_density_shape"]
EGRESS_DELAY_MINUTES = int(TRIP_CFG["egress_delay_minutes"])
EGRESS_PULSE_MINUTES = int(TRIP_CFG["egress_pulse_minutes"])
EGRESS_DENSITY_SHAPE = TRIP_CFG["egress_density_shape"]
ALTERNATE_EVENING_HOUR = s12.ALTERNATE_EVENING_HOUR
ALL_ARRIVAL_WINDOWS_MINUTES = sorted(set([ARRIVAL_WINDOW_MINUTES] + ARRIVAL_WINDOW_SENSITIVITY_MINUTES))

ASSUMPTION_NOTE = (
    "arrival_window_minutes, arrival_window_sensitivity_minutes, arrival_density_shape, "
    "egress_delay_minutes, egress_pulse_minutes and egress_density_shape are read from "
    "pipeline/config.yml under trip and are modeled assumptions, not observations. no gate "
    "arrival survey or turnstile egress record for NRG Stadium or any other 2026 FIFA World "
    "Cup venue exists anywhere in this repository, so a defensible simple shape was chosen "
    "over an invented one. arrival_density_shape uniform means fans are assumed to arrive at "
    "a constant rate across the arrival_window_minutes immediately before kickoff. a density "
    "rising toward the final 45 minutes before kickoff is plausibly more realistic for a "
    "ticketed single admission event, but no citation for a stadium specific or FIFA specific "
    "gate arrival curve was found, so that shape was left unused rather than fabricated. "
    "egress_density_shape uniform models egress as a flat pulse over egress_pulse_minutes "
    "starting egress_delay_minutes after kickoff, standing in for roughly 90 minutes of play "
    "plus a roughly 15 minute half time plus roughly 15 minutes of stoppage before the final "
    "whistle. changing any of these five values in config.yml and rerunning this stage changes "
    "every number below, which is the reason they are named constants there and not inline"
)

METHOD_NOTE = (
    "this stage estimates a trip total for each of the seven NRG Stadium matches, in addition "
    "to and never in place of the kickoff instant figure already measured in "
    "data/out/retrospective.json. the inbound leg distributes fans uniformly across "
    "arrival_window_minutes ending at kickoff, and the outbound leg distributes fans uniformly "
    "across egress_pulse_minutes starting egress_delay_minutes after kickoff. each leg is split "
    "across whichever modelled clock hours it overlaps, weighted by the share of that leg's own "
    "duration falling in each hour, and each hour's fan degree hours above threshold is computed "
    "exactly as pipeline/s12_retrospective.py computes the kickoff hour: refetching that match's "
    "own observed ASOS weather for that date and hour, coupling it to the same land surface "
    "temperature field, rebaking the shade mask for that match's own date and that hour with "
    "true solar geometry, and walking the same four last mile approaches. no hour from the "
    "generalized sweep in pipeline/s10_kickoff.py is reused here, and no match's exposure is "
    "estimated from another match's date. the kickoff hour itself is never recomputed by this "
    "stage, it is read from data/out/retrospective.json, since by construction neither leg "
    "overlaps the kickoff hour. data/out/retrospective.json is not modified by this stage and "
    "its tournament_total and counterfactual_evening_kickoff blocks remain frozen"
)

WEATHER_UNAVAILABLE_NOTE = (
    "if the Iowa Environmental Mesonet ASOS archive cannot return a usable observation at all "
    "three stations for any hour a leg needs, that leg and therefore that match's trip total is "
    "reported unavailable, naming the exact hour and the missing station, and is excluded from "
    "every total and every counterfactual below rather than estimated from a substitute date or "
    "hour or a neighbouring hour's value"
)

COUNTERFACTUAL_NOTE = (
    "this recomputes the same evening kickoff counterfactual as "
    "data/out/retrospective.json's counterfactual_evening_kickoff block, but on trip totals "
    "instead of kickoff instant totals, holding each date's own observed weather fixed exactly "
    "as that block does. it asks how much of the measured trip exposure at the six noon matches "
    "would not have occurred had each kicked off at 19:00 local instead, recomputing both the "
    "noon trip and the alternate 19:00 trip from that match's own date, and comparing the two. "
    "the one match actually played at 19:00 is left unchanged in both totals, as in the original "
    "counterfactual. arrival egress asymmetry can move this share in either direction relative to "
    "the kickoff instant counterfactual: a noon kickoff's egress leg lands in the hottest part of "
    "the afternoon, which can push the noon side of the comparison up, while the evening "
    "counterfactual's own arrival leg is not free either, since it falls in the still hot late "
    "afternoon hours before a 19:00 kickoff, which can push the alternate side of the comparison "
    "up too. which effect dominates is reported below as computed, not assumed"
)


def leg_hour_weights(start_hour, duration_hours):
    end_hour = start_hour + duration_hours
    weights = {}
    h = int(math.floor(start_hour + 1e-9))
    while h < end_hour - 1e-9:
        overlap = min(h + 1, end_hour) - max(h, start_hour)
        if overlap > 1e-9:
            weights[h] = overlap / duration_hours
        h += 1
    return weights


def hour_fan_degree_hours(cache, date_str, hour, ctx):
    key = (date_str, hour)
    if key in cache:
        return cache[key]
    conditions, missing = s12.evaluate_conditions(
        ctx["bounds"], ctx["lst_field"], ctx["lst_area_mean"], ctx["dsm"], ctx["pad_cells"],
        ctx["route_points"], date_str, hour,
    )
    if conditions is None:
        entry = {"status": "unavailable", "missing_stations": missing}
    else:
        degmin_by_approach, peak_by_approach = s12.aggregate_by_approach(ctx["route_points"], conditions["exposure_pts"])
        fan_degree_hours, _, _ = s12.fan_exposure(degmin_by_approach, peak_by_approach)
        entry = {"status": "observed", "fan_degree_hours": fan_degree_hours}
    cache[key] = entry
    return entry


def leg_total(cache, date_str, start_hour, duration_hours, ctx):
    weights = leg_hour_weights(start_hour, duration_hours)
    total = 0.0
    hours_weights = {}
    missing_hours = {}
    for hour, weight in weights.items():
        hours_weights[str(hour)] = round(weight, 4)
        entry = hour_fan_degree_hours(cache, date_str, hour, ctx)
        if entry["status"] != "observed":
            missing_hours[str(hour)] = entry["missing_stations"]
            continue
        total += weight * entry["fan_degree_hours"]
    if missing_hours:
        return {"status": "unavailable", "hours_weights": hours_weights, "missing_hours": missing_hours}
    return {"status": "observed", "fan_degree_hours": round(total, 2), "hours_weights": hours_weights}


def build_trip_summary(inbound, outbound, reference_fdh):
    if inbound["status"] != "observed" or outbound["status"] != "observed":
        return {
            "trip_status": "unavailable",
            "trip_total_fan_degree_hours": None,
            "ratio_trip_to_reference": None,
        }
    trip_total = inbound["fan_degree_hours"] + outbound["fan_degree_hours"]
    if reference_fdh and reference_fdh > 0:
        ratio = round(trip_total / reference_fdh, 3)
    else:
        ratio = None
    return {
        "trip_status": "observed",
        "trip_total_fan_degree_hours": round(trip_total, 2),
        "ratio_trip_to_reference": ratio,
    }


def build_match_trip(fixture, instant_by_date, cache, ctx):
    date_str = str(fixture["date"])
    kickoff_hour = int(fixture["kickoff_local_hour"])
    record = {
        "date": date_str,
        "kickoff_local_hour": kickoff_hour,
        "stage": fixture.get("stage"),
        "label": fixture.get("label"),
    }

    instant = instant_by_date.get(date_str)
    if instant is None or instant.get("weather_status") != "observed":
        record["trip_status"] = "unavailable"
        record["unavailable_reason"] = (
            "the kickoff instant record for this date in data/out/retrospective.json is not "
            "observed, so no trip total was attempted for it either"
        )
        return record

    instant_fdh = instant["fan_degree_hours_above_threshold"]
    record["kickoff_instant_fan_degree_hours_above_threshold"] = instant_fdh

    inbound = leg_total(cache, date_str, kickoff_hour - ARRIVAL_WINDOW_MINUTES / 60.0, ARRIVAL_WINDOW_MINUTES / 60.0, ctx)
    outbound = leg_total(cache, date_str, kickoff_hour + EGRESS_DELAY_MINUTES / 60.0, EGRESS_PULSE_MINUTES / 60.0, ctx)
    summary = build_trip_summary(inbound, outbound, instant_fdh)

    record["inbound"] = inbound
    record["outbound"] = outbound
    record["trip_status"] = summary["trip_status"]
    record["trip_total_fan_degree_hours_above_threshold"] = summary["trip_total_fan_degree_hours"]
    record["ratio_trip_to_kickoff_instant"] = summary["ratio_trip_to_reference"]
    if instant_fdh == 0 and summary["trip_status"] == "observed":
        record["ratio_note"] = (
            "the kickoff instant figure for this match is exactly 0.0, so the ratio is undefined "
            "and reported as null, the trip total above should be read directly instead of as a "
            "multiple of zero"
        )
    if summary["trip_status"] != "observed":
        record["unavailable_reason"] = (
            "one or more hours needed for this match's inbound or outbound leg could not be "
            "evaluated, see missing_hours under inbound or outbound above, weather was not "
            "substituted from another hour or date"
        )

    sensitivity = {}
    for minutes in ARRIVAL_WINDOW_SENSITIVITY_MINUTES:
        alt_inbound = leg_total(cache, date_str, kickoff_hour - minutes / 60.0, minutes / 60.0, ctx)
        alt_summary = build_trip_summary(alt_inbound, outbound, instant_fdh)
        sensitivity[str(minutes)] = {
            "arrival_window_minutes": minutes,
            "inbound": alt_inbound,
            "trip_status": alt_summary["trip_status"],
            "trip_total_fan_degree_hours_above_threshold": alt_summary["trip_total_fan_degree_hours"],
            "ratio_trip_to_kickoff_instant": alt_summary["ratio_trip_to_reference"],
        }
    record["arrival_window_sensitivity_minutes"] = sensitivity

    return record


def actual_trip_at_window(record, minutes):
    if record.get("trip_status") != "observed":
        return None
    if minutes == ARRIVAL_WINDOW_MINUTES:
        return record["trip_total_fan_degree_hours_above_threshold"]
    sens = record.get("arrival_window_sensitivity_minutes", {}).get(str(minutes))
    if not sens or sens["trip_status"] != "observed":
        return None
    return sens["trip_total_fan_degree_hours_above_threshold"]


def build_counterfactual_trip_for_window(fixtures, matches_by_date, cache, ctx, arrival_minutes):
    noon_fixtures = [f for f in fixtures if int(f["kickoff_local_hour"]) != ALTERNATE_EVENING_HOUR]
    evening_fixtures = [f for f in fixtures if int(f["kickoff_local_hour"]) == ALTERNATE_EVENING_HOUR]

    per_match = []
    actual_total = 0.0
    counterfactual_total = 0.0
    n_included = 0

    for fixture in noon_fixtures:
        date_str = str(fixture["date"])
        record = matches_by_date[date_str]
        actual_trip = actual_trip_at_window(record, arrival_minutes)
        if actual_trip is None:
            per_match.append(
                {
                    "date": date_str,
                    "kickoff_local_hour": int(fixture["kickoff_local_hour"]),
                    "status": "excluded_actual_trip_unavailable",
                }
            )
            continue

        alt_inbound = leg_total(cache, date_str, ALTERNATE_EVENING_HOUR - arrival_minutes / 60.0, arrival_minutes / 60.0, ctx)
        alt_outbound = leg_total(cache, date_str, ALTERNATE_EVENING_HOUR + EGRESS_DELAY_MINUTES / 60.0, EGRESS_PULSE_MINUTES / 60.0, ctx)
        alt_summary = build_trip_summary(alt_inbound, alt_outbound, actual_trip)
        if alt_summary["trip_status"] != "observed":
            per_match.append(
                {
                    "date": date_str,
                    "kickoff_local_hour": int(fixture["kickoff_local_hour"]),
                    "actual_trip_total_fan_degree_hours_above_threshold": round(actual_trip, 2),
                    "status": f"excluded_no_observed_weather_for_alternate_{ALTERNATE_EVENING_HOUR}_00_trip_on_this_date",
                }
            )
            continue

        alt_trip = alt_summary["trip_total_fan_degree_hours"]
        actual_total += actual_trip
        counterfactual_total += alt_trip
        n_included += 1
        per_match.append(
            {
                "date": date_str,
                "kickoff_local_hour": int(fixture["kickoff_local_hour"]),
                "actual_trip_total_fan_degree_hours_above_threshold": round(actual_trip, 2),
                "counterfactual_evening_trip_total_fan_degree_hours_above_threshold": round(alt_trip, 2),
                "difference": round(actual_trip - alt_trip, 2),
                "status": "included",
            }
        )

    for fixture in evening_fixtures:
        date_str = str(fixture["date"])
        record = matches_by_date[date_str]
        v = actual_trip_at_window(record, arrival_minutes)
        if v is not None:
            actual_total += v
            counterfactual_total += v
            n_included += 1

    removed = actual_total - counterfactual_total
    removed_fraction = round(removed / actual_total, 4) if actual_total else None

    return {
        "arrival_window_minutes": arrival_minutes,
        "alternate_hour": ALTERNATE_EVENING_HOUR,
        "per_match": per_match,
        "totals": {
            "n_matches_included": n_included,
            "actual_total_trip_fan_degree_hours_above_threshold": round(actual_total, 1),
            "counterfactual_total_trip_fan_degree_hours_above_threshold": round(counterfactual_total, 1),
            "removed_trip_fan_degree_hours": round(removed, 1),
            "removed_fraction": removed_fraction,
        },
    }


def build_tournament_trip_total(matches):
    included = [m for m in matches if m.get("trip_status") == "observed"]
    excluded = [m for m in matches if m.get("trip_status") != "observed"]
    total = sum(m["trip_total_fan_degree_hours_above_threshold"] for m in included)
    instant_total_same_matches = sum(m["kickoff_instant_fan_degree_hours_above_threshold"] for m in included)
    return {
        "n_matches_total": len(matches),
        "n_matches_included": len(included),
        "n_matches_excluded": len(excluded),
        "excluded_dates": [m["date"] for m in excluded],
        "trip_total_fan_degree_hours_above_threshold": round(total, 1),
        "kickoff_instant_total_for_same_matches": round(instant_total_same_matches, 1),
        "ratio_trip_to_kickoff_instant_tournament": (
            round(total / instant_total_same_matches, 3) if instant_total_same_matches else None
        ),
        "statement": (
            f"across the {len(included)} of {len(matches)} matches with a fully observed trip "
            f"computation, fans accumulated {round(total):,} fan degree hours above threshold "
            "across the full inbound plus outbound trip, against "
            f"{round(instant_total_same_matches):,} for the same matches' kickoff instant figure, "
            f"a ratio of {round(total / instant_total_same_matches, 2) if instant_total_same_matches else float('nan')}x."
        ),
    }


def build_ctx():
    bounds = c.get_raster_bounds()
    routes = c.compute_routes()
    route_points = s12.build_route_points(bounds, routes)
    lst_field, lst_area_mean, _ = lst.get_uhi_field(bounds)
    margin_m = s12.MAX_MARCH_STEPS * c.CFG["raster"]["resolution_m"]
    dsm, pad_cells = s3.build_dsm(bounds, margin_m)
    return {
        "bounds": bounds,
        "route_points": route_points,
        "lst_field": lst_field,
        "lst_area_mean": lst_area_mean,
        "dsm": dsm,
        "pad_cells": pad_cells,
    }


def main():
    c.ensure_dirs()
    retro_path = c.OUT_DIR / "retrospective.json"
    if not retro_path.exists():
        raise RuntimeError("data/out/retrospective.json does not exist, run pipeline/s12_retrospective.py first")
    retro = c.read_json(retro_path)
    instant_by_date = {m["date"]: m for m in retro["matches"]}

    fixtures_cfg = c.CFG.get("fixtures")
    if not fixtures_cfg or not fixtures_cfg.get("matches"):
        raise RuntimeError("pipeline/config.yml has no fixtures.matches block to measure against")
    fixtures = fixtures_cfg["matches"]

    ctx = build_ctx()
    cache = {}

    matches = []
    matches_by_date = {}
    for fixture in fixtures:
        record = build_match_trip(fixture, instant_by_date, cache, ctx)
        matches.append(record)
        matches_by_date[record["date"]] = record
        if record.get("trip_status") == "observed":
            print(
                f"{record['date']} {record['kickoff_local_hour']:02d}:00 {record['stage']}: "
                f"kickoff_instant={record['kickoff_instant_fan_degree_hours_above_threshold']} "
                f"trip_total={record['trip_total_fan_degree_hours_above_threshold']} "
                f"ratio={record['ratio_trip_to_kickoff_instant']}"
            )
        else:
            print(f"{record['date']} {record['kickoff_local_hour']:02d}:00: trip unavailable, {record.get('unavailable_reason')}")

    counterfactual_by_window = {
        str(minutes): build_counterfactual_trip_for_window(fixtures, matches_by_date, cache, ctx, minutes)
        for minutes in ALL_ARRIVAL_WINDOWS_MINUTES
    }
    counterfactual_primary = counterfactual_by_window[str(ARRIVAL_WINDOW_MINUTES)]

    old_removed_fraction = retro["counterfactual_evening_kickoff"]["totals"]["removed_fraction"]
    new_removed_fraction = counterfactual_primary["totals"]["removed_fraction"]
    if old_removed_fraction is not None and new_removed_fraction is not None:
        delta_pp = round(100 * (new_removed_fraction - old_removed_fraction), 1)
        comparison_statement = (
            f"the kickoff instant counterfactual in data/out/retrospective.json reports "
            f"{round(100 * old_removed_fraction, 1)} percent of measured exposure at the noon "
            f"matches removed by an evening kickoff. recomputed on trip totals at the "
            f"{ARRIVAL_WINDOW_MINUTES} minute arrival window, that figure is "
            f"{round(100 * new_removed_fraction, 1)} percent, a move of {delta_pp:+.1f} "
            "percentage points once the inbound arrival leg and the outbound egress leg of both "
            "the noon trip and its evening alternative are counted rather than only the kickoff "
            "instant."
        )
    else:
        comparison_statement = (
            "one of the two removed fractions being compared is undefined because its actual "
            "total was zero, see totals above"
        )

    tournament_trip_total = build_tournament_trip_total(matches)

    out = {
        "generated_utc": c.now_iso(),
        "wbgt_threshold_c": s12.THRESHOLD_C,
        "arrival_window_minutes": ARRIVAL_WINDOW_MINUTES,
        "arrival_window_sensitivity_minutes": ARRIVAL_WINDOW_SENSITIVITY_MINUTES,
        "arrival_density_shape": ARRIVAL_DENSITY_SHAPE,
        "egress_delay_minutes": EGRESS_DELAY_MINUTES,
        "egress_pulse_minutes": EGRESS_PULSE_MINUTES,
        "egress_density_shape": EGRESS_DENSITY_SHAPE,
        "assumption_note": ASSUMPTION_NOTE,
        "method_note": METHOD_NOTE,
        "weather_unavailable_note": WEATHER_UNAVAILABLE_NOTE,
        "matches": matches,
        "tournament_trip_total": tournament_trip_total,
        "counterfactual_evening_kickoff_trip": {
            "note": COUNTERFACTUAL_NOTE,
            "primary": counterfactual_primary,
            "sensitivity_by_arrival_window_minutes": counterfactual_by_window,
            "comparison_to_kickoff_instant_counterfactual": {
                "old_removed_fraction_kickoff_instant": old_removed_fraction,
                "new_removed_fraction_trip_total": new_removed_fraction,
                "statement": comparison_statement,
            },
        },
    }

    c.write_json(c.OUT_DIR / "trip_exposure.json", out)

    print("trip_exposure.json written")
    print(tournament_trip_total["statement"])
    print(comparison_statement)


if __name__ == "__main__":
    main()
