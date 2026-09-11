import csv
import json
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
META_PATH = ROOT / "data" / "out" / "meta.json"
COSTS_PATH = ROOT / "pipeline" / "costs.yml"
CONFIG_PATH = ROOT / "pipeline" / "config.yml"
RETROSPECTIVE_PATH = ROOT / "data" / "out" / "retrospective.json"
OUT_PATH = ROOT / "docs" / "provenance.csv"

FIELDNAMES = [
    "layer",
    "product_id",
    "provider",
    "access_path",
    "acquisition_or_vintage_date",
    "resolution",
    "licence",
    "status",
    "usage",
    "notes",
]

USAGE_BY_KEYWORD = [
    ("meteorology hour", "air temperature, dew point, wind and pressure input to the Liljegren WBGT model for this kickoff hour"),
    ("land surface temperature", "spatial urban heat island coupling term added on top of the interpolated station air temperature"),
    ("solar irradiance", "clear sky global horizontal irradiance driving the WBGT globe and natural wet bulb terms and the shadow raymarch"),
    ("digital surface model", "building height raster used to raymarch shade masks per kickoff hour"),
    ("nrg stadium footprint", "venue polygon and approximated gate points that walking routes terminate at"),
    ("urban heat island corroboration", "corroboration check only against the pipeline's own Landsat heat anomaly, not an input to the WBGT model"),
    ("organizer weather", "side by side seasonal sanity check against ASOS observations, not blended into the physics pipeline"),
]

NOTE_FIELDS_PRIORITY = [
    "substitution_note",
    "organizer_data_limitation",
    "date_selection_note",
    "overpass_time_note",
    "beta_note",
    "height_source_note",
    "weather_station_note",
    "method",
    "verdict",
]


def load_meta():
    with open(META_PATH) as f:
        return json.load(f)


def load_costs():
    with open(COSTS_PATH) as f:
        return yaml.safe_load(f)


def load_config():
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


def load_retrospective():
    if not RETROSPECTIVE_PATH.exists():
        return None
    with open(RETROSPECTIVE_PATH) as f:
        return json.load(f)


def usage_for_layer(layer):
    layer_lower = layer.lower()
    for keyword, usage in USAGE_BY_KEYWORD:
        if keyword in layer_lower:
            return usage
    return "see notes column"


def notes_for_source(source):
    parts = []
    for field in NOTE_FIELDS_PRIORITY:
        value = source.get(field)
        if value:
            parts.append(value)
    return " | ".join(parts)


def status_for_source(source):
    if source.get("substitution_note"):
        return "substituted"
    if source.get("organizer_data_limitation"):
        return "corroboration_only"
    return "measured"


def date_for_source(source, meta):
    if source.get("date_used"):
        return source["date_used"]
    scenes = source.get("scenes")
    if scenes:
        dates = sorted(s["date"] for s in scenes if s.get("date"))
        if dates:
            return f"{dates[0]} to {dates[-1]}, {len(scenes)} pooled scenes"
    if source.get("fetched_utc"):
        return source["fetched_utc"][:10]
    return f"n/a, see generated_utc {meta.get('generated_utc', 'unknown')} for pipeline run date"


def access_for_source(source):
    if source.get("access"):
        return source["access"]
    stations = source.get("stations")
    if stations:
        return "Iowa Environmental Mesonet ASOS archive, stations " + ", ".join(stations)
    return "n/a"


def resolution_for_source(source, layer, resolution_m):
    layer_lower = layer.lower()
    if source.get("stations"):
        return f"point station observation, interpolated onto the {resolution_m} m pipeline grid"
    if source.get("scenes"):
        return f"resampled onto the {resolution_m} m pipeline grid, see product field for native sensor pixel size"
    if "solar irradiance" in layer_lower:
        return f"modeled at the {resolution_m} m pipeline grid resolution, not a fixed sensor pixel size"
    if "digital surface model" in layer_lower or "footprint" in layer_lower:
        return f"vector footprints rasterized onto the {resolution_m} m pipeline grid"
    if "urban heat island corroboration" in layer_lower or "organizer weather" in layer_lower:
        return "point locations, hackathon sample data, no native raster resolution stated by organizers"
    return "n/a"


def rows_from_meta(meta):
    resolution_m = meta.get("raster_resolution_m", "n/a")
    rows = []
    for source in meta.get("sources", []):
        layer = source.get("layer", "")
        rows.append({
            "layer": layer,
            "product_id": source.get("product", ""),
            "provider": source.get("provider", ""),
            "access_path": access_for_source(source),
            "acquisition_or_vintage_date": date_for_source(source, meta),
            "resolution": resolution_for_source(source, layer, resolution_m),
            "licence": source.get("licence", "n/a"),
            "status": status_for_source(source),
            "usage": usage_for_layer(layer),
            "notes": notes_for_source(source),
        })
    return rows


def unit_cost_for_intervention(spec):
    for key in ("unit_cost_usd", "unit_cost_usd_per_m2", "unit_cost_usd_per_day"):
        if key in spec:
            return key, spec[key]
    return None, None


def vintage_year_from_citation(citation):
    match = re.search(r"(19|20)\d{2}", citation)
    return match.group(0) if match else "n/a"


def rows_from_costs(costs):
    rows = []
    for name, spec in costs.get("interventions", {}).items():
        citation = spec.get("citation", "")
        key, value = unit_cost_for_intervention(spec)
        unsourced = citation.strip().lower().startswith("no public unit cost located")
        rows.append({
            "layer": f"intervention unit cost: {name}",
            "product_id": spec.get("label", name),
            "provider": "see notes column for the cited source",
            "access_path": "pipeline/costs.yml",
            "acquisition_or_vintage_date": vintage_year_from_citation(citation),
            "resolution": "n/a, unit cost is not spatial data",
            "licence": "n/a, published cost citation, not a licensed dataset",
            "status": "unsourced_estimate" if unsourced else "sourced",
            "usage": f"optimizer intervention unit cost, {key}={value}, ranked by pipeline/s6_optimize.py cost effectiveness greedy heuristic",
            "notes": citation,
        })
    return rows


def rows_from_retrospective(retro, meta):
    rows = []
    if not retro:
        return rows
    resolution_m = meta.get("raster_resolution_m", "n/a")
    for match in retro.get("matches", []):
        date = match.get("date", "unknown date")
        hour = match.get("kickoff_local_hour", "unknown hour")
        stations = sorted(match.get("stations", {}).keys())
        weather_status = match.get("weather_status", "unknown")
        rows.append({
            "layer": f"retrospective per-match meteorology, {date} kickoff {hour}:00",
            "product_id": "Iowa Environmental Mesonet ASOS one minute and hourly archive",
            "provider": "Iowa State University Department of Agronomy",
            "access_path": "Iowa Environmental Mesonet ASOS archive, stations " + ", ".join(stations),
            "acquisition_or_vintage_date": date,
            "resolution": f"point station observation, interpolated onto the {resolution_m} m pipeline grid",
            "licence": "public, no key required",
            "status": "measured" if weather_status == "observed" else weather_status,
            "usage": "this match's own observed air temperature, dew point, wind and pressure, fetched fresh for this match's own date and kickoff hour by pipeline/s12_retrospective.py, feeding the 297,665 fan-degree-hour tournament total this project reports as its headline",
            "notes": (
                f"{match.get('label', '')} ({match.get('stage', '')}), weather_status {weather_status}. "
                "this is the load bearing per-match ASOS pull behind the tournament total, distinct from "
                "the generalized hour-sweep meteorology rows above, which substitute whichever candidate "
                "match date was hottest for a given hour rather than fetching each match's own date."
            ),
        })
    return rows


def rows_from_fixtures(config):
    fixtures = config.get("fixtures", {}) if config else {}
    matches = fixtures.get("matches", [])
    if not matches:
        return []
    source = fixtures.get("source", "n/a")
    dates = ", ".join(str(m.get("date", "")) for m in matches)
    return [{
        "layer": "fixture list, seven NRG Stadium 2026 World Cup matches",
        "product_id": source,
        "provider": "FIFA and competition organisers",
        "access_path": "pipeline/config.yml, fixtures.matches",
        "acquisition_or_vintage_date": fixtures.get("verified_utc", "n/a"),
        "resolution": "n/a, schedule data is not spatial",
        "licence": "n/a",
        "status": "cross_checked_sources_not_individually_cited",
        "usage": "binds every per-match date and kickoff hour used throughout this project, including the seven retrospective ASOS pulls above and the fixture-hour illustrative block in data/out/kickoff_clock.json",
        "notes": (
            (fixtures.get("note", "") + " | " if fixtures.get("note") else "")
            + f"this fixture list is described in pipeline/config.yml as \"{source}\", "
            "but the two independent public listings it was cross checked against are not "
            "individually named or linked anywhere in this repository. that is a real gap in "
            "this provenance ledger, stated directly here rather than left implicit. "
            f"matches covered: {dates}."
        ),
    }]


def main():
    meta = load_meta()
    costs = load_costs()
    config = load_config()
    retro = load_retrospective()
    rows = (
        rows_from_meta(meta)
        + rows_from_retrospective(retro, meta)
        + rows_from_fixtures(config)
        + rows_from_costs(costs)
    )
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
    print(f"wrote {len(rows)} rows to {OUT_PATH}", file=sys.stderr)


if __name__ == "__main__":
    main()
