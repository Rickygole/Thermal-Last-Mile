import sys
from pathlib import Path
from importlib.metadata import version

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as c


def leave_one_out_validation():
    stations = list(c.ASOS_STATIONS.keys())
    errors = []
    for hour in c.kickoff_hours():
        date_str = c.hottest_date_for_hour(hour)
        obs = {s: c.station_hour_obs(s, date_str, hour) for s in stations}
        if any(v is None for v in obs.values()):
            continue
        for held_out in stations:
            others = {s: v["tair_c"] for s, v in obs.items() if s != held_out}
            hx, hy = c.lonlat_to_utm(c.ASOS_STATIONS[held_out]["lon"], c.ASOS_STATIONS[held_out]["lat"])
            wsum, vsum = 0.0, 0.0
            for s, val in others.items():
                sx, sy = c.lonlat_to_utm(c.ASOS_STATIONS[s]["lon"], c.ASOS_STATIONS[s]["lat"])
                d2 = (hx - sx) ** 2 + (hy - sy) ** 2
                w = 1.0 / d2
                wsum += w
                vsum += w * val
            predicted = vsum / wsum
            observed = obs[held_out]["tair_c"]
            errors.append(predicted - observed)
    if not errors:
        return {"rmse_c": None, "bias_c": None, "n_stations": len(stations)}
    errors = np.array(errors)
    return {
        "rmse_c": round(float(np.sqrt(np.mean(errors**2))), 2),
        "bias_c": round(float(np.mean(errors)), 2),
        "n_stations": len(stations),
        "n_samples": int(errors.size),
        "quantity_validated": "air temperature",
        "method": (
            "leave one out cross validation of the inverse distance weighted "
            "station interpolation used for the meteorological input grid, "
            "predicting each ASOS station from the other two and comparing to "
            "its own observation, across all kickoff hours and the match date "
            "selected for each hour. This validates the spatial interpolation "
            "of real observations, not the Liljegren WBGT model itself, since "
            "no wet bulb globe temperature instrument record exists for this "
            "site and these dates"
        ),
    }


def gather_hour_sources():
    sources = []
    for hour in c.kickoff_hours():
        wbgt_meta = c.read_json(c.INTERIM_DIR / f"wbgt_{hour:02d}_meta.json")
        sources.append(
            {
                "layer": f"meteorology hour {hour}",
                "product": "Iowa Environmental Mesonet ASOS one minute and hourly archive",
                "stations": list(c.ASOS_STATIONS.keys()),
                "date_used": wbgt_meta["date_used"],
                "match_dates_considered": wbgt_meta["match_dates_considered"],
                "date_selection_note": wbgt_meta["date_selection_note"],
                "provider": "Iowa State University Department of Agronomy",
                "licence": "public, no key required",
            }
        )
    return sources


def main():
    c.ensure_dirs()
    bounds = c.get_raster_bounds()
    dsm_meta = c.read_json(c.INTERIM_DIR / "dsm_meta.json")
    if not (c.RAW_DIR / "osm" / "nrg_stadium.json").exists():
        c.stadium_gates()
    buildings_meta = c.read_json(c.RAW_DIR / "osm" / "buildings.json")
    stadium_meta = c.read_json(c.RAW_DIR / "osm" / "nrg_stadium.json")
    segments_meta = c.read_json(c.INTERIM_DIR / "segments_meta.json")
    wbgt_meta_by_hour = {
        hour: c.read_json(c.INTERIM_DIR / f"wbgt_{hour:02d}_meta.json") for hour in c.kickoff_hours()
    }

    sources = gather_hour_sources()
    sources.append(
        {
            "layer": "solar irradiance",
            "product": "pvlib clearsky ineichen model",
            "substitution_note": (
                "NREL NSRDB requires an API key and the developer.nrel.gov host "
                "was not reachable from this environment, so clear sky GHI from "
                "pvlib was used instead of NSRDB observed or modeled irradiance"
            ),
            "provider": "pvlib python",
        }
    )
    sources.append(
        {
            "layer": "digital surface model for shading",
            "product": "OpenStreetMap building footprints rasterized at 1 m",
            "substitution_note": buildings_meta["substitution_note"],
            "height_source_note": dsm_meta["height_source_note"],
            "n_buildings_rasterized": dsm_meta["n_buildings_rasterized"],
            "provider": "OpenStreetMap via Overpass API, osmnx",
            "licence": "ODbL",
        }
    )
    sources.append(
        {
            "layer": "NRG Stadium footprint and gates",
            "product": "OpenStreetMap building=stadium way",
            "substitution_note": stadium_meta["note"],
            "provider": "OpenStreetMap via Overpass API, osmnx",
            "licence": "ODbL",
        }
    )

    meta = {
        "generated_utc": c.now_iso(),
        "model": {
            "wbgt": c.COSTS["constants"]["wbgt_model"]["citation"],
            "implementation": f"pywbgt {version('pywbgt')}",
            "pvlib_version": version("pvlib"),
        },
        "sources": sources,
        "validation": leave_one_out_validation(),
        "costs": [
            {
                "item": name,
                "unit_cost_usd": spec.get("unit_cost_usd", spec.get("unit_cost_usd_per_m2", spec.get("unit_cost_usd_per_day"))),
                "citation": spec.get("citation"),
            }
            for name, spec in c.COSTS["interventions"].items()
        ],
        "raster_bounds": bounds["lonlat_bounds"],
        "raster_resolution_m": bounds["resolution_m"],
        "assumptions": {
            "tair_tolerance_c": wbgt_meta_by_hour[c.kickoff_hours()[0]]["tair_tolerance_c"],
            "tair_tolerance_note": wbgt_meta_by_hour[c.kickoff_hours()[0]]["tair_tolerance_note"],
            "path_width_assumption_m": segments_meta["path_width_assumption_m"],
            "path_width_note": segments_meta["path_width_note"],
            "nrg_capacity": segments_meta["nrg_capacity"],
            "nrg_capacity_note": segments_meta["nrg_capacity_note"],
            "approach_mode_share": segments_meta["approach_mode_share"],
            "mode_share_note": segments_meta["mode_share_note"],
            "svi_note": segments_meta["svi_note"],
            "canopy_pct_note": segments_meta["canopy_pct_note"],
        },
        "n_segments": segments_meta["n_segments"],
        "wbgt_threshold_c": segments_meta["wbgt_threshold_c"],
    }

    c.write_json(c.OUT_DIR / "meta.json", meta)
    print("meta.json written")
    print("validation:", meta["validation"])


if __name__ == "__main__":
    main()
