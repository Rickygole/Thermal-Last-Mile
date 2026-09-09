import json
import time
from pathlib import Path

import numpy as np
import pyproj
import rasterio
import rasterio.mask
import requests
from shapely.geometry import Point, mapping
from shapely.ops import transform

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "out"

MILE_M = 1609.34
BUFFER_MILES = 2.0
BUFFER_M = BUFFER_MILES * MILE_M
WBGT_THRESHOLD_C = 32.0
NOMINAL_TRIP_MIN = 15.0
HOUSTON_ANCHOR_DEGMIN = 128.4

MRLC_WCS_URL = "https://www.mrlc.gov/geoserver/ows"
MRLC_COVERAGE_ID = "mrlc_download__nlcd_tcc_conus_2021_v2021-4"

PC_STAC_SEARCH_URL = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
PC_SAS_SIGN_URL = "https://planetarycomputer.microsoft.com/api/sas/v1/sign"
LST_YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024]
LST_SCENES_PER_YEAR = 2
LST_MAX_CLOUD = 30
LST_MAX_SCENES = 10

CITIES = [
    {"id": "atlanta", "name": "Atlanta", "venue": "Mercedes-Benz Stadium",
     "lat": 33.7554, "lon": -84.4008, "matches": 8},
    {"id": "boston", "name": "Boston", "venue": "Gillette Stadium, Foxborough",
     "lat": 42.0909, "lon": -71.2643, "matches": 7},
    {"id": "dallas", "name": "Dallas", "venue": "AT&T Stadium, Arlington",
     "lat": 32.7473, "lon": -97.0945, "matches": 9},
    {"id": "houston", "name": "Houston", "venue": "NRG Stadium",
     "lat": 29.685, "lon": -95.410, "matches": 7},
    {"id": "kansas_city", "name": "Kansas City", "venue": "Arrowhead Stadium",
     "lat": 39.0489, "lon": -94.4839, "matches": 6},
    {"id": "los_angeles", "name": "Los Angeles", "venue": "SoFi Stadium, Inglewood",
     "lat": 33.9535, "lon": -118.3392, "matches": 8},
    {"id": "miami", "name": "Miami", "venue": "Hard Rock Stadium, Miami Gardens",
     "lat": 25.9580, "lon": -80.2389, "matches": 7},
    {"id": "new_york_new_jersey", "name": "New York/New Jersey", "venue": "MetLife Stadium, East Rutherford",
     "lat": 40.8135, "lon": -74.0745, "matches": 8},
    {"id": "philadelphia", "name": "Philadelphia", "venue": "Lincoln Financial Field",
     "lat": 39.9008, "lon": -75.1675, "matches": 6},
    {"id": "san_francisco_bay_area", "name": "San Francisco Bay Area", "venue": "Levi's Stadium, Santa Clara",
     "lat": 37.4033, "lon": -121.9694, "matches": 6},
    {"id": "seattle", "name": "Seattle", "venue": "Lumen Field",
     "lat": 47.5952, "lon": -122.3316, "matches": 6},
]


def buffer_geometry(lat, lon, radius_m):
    aeqd = pyproj.CRS.from_proj4(
        "+proj=aeqd +lat_0={} +lon_0={} +units=m +ellps=WGS84".format(lat, lon)
    )
    to_aeqd = pyproj.Transformer.from_crs("EPSG:4326", aeqd, always_xy=True).transform
    to_wgs84 = pyproj.Transformer.from_crs(aeqd, "EPSG:4326", always_xy=True).transform
    pt = transform(to_aeqd, Point(lon, lat))
    circle_m = pt.buffer(radius_m, resolution=64)
    circle_deg = transform(to_wgs84, circle_m)
    return circle_deg, aeqd


def fetch_canopy_nlcd(buf_deg):
    minx, miny, maxx, maxy = buf_deg.bounds
    pad = 0.003
    params = {
        "service": "WCS",
        "version": "2.0.1",
        "request": "GetCoverage",
        "coverageId": MRLC_COVERAGE_ID,
        "format": "image/geotiff",
        "subsettingCrs": "http://www.opengis.net/def/crs/EPSG/0/4326",
        "subset": [
            "Lat({},{})".format(miny - pad, maxy + pad),
            "Long({},{})".format(minx - pad, maxx + pad),
        ],
    }
    r = requests.get(MRLC_WCS_URL, params=params, timeout=60)
    r.raise_for_status()
    if r.headers.get("content-type", "").find("geotiff") < 0 and r.headers.get("content-type", "").find("tiff") < 0:
        raise RuntimeError("MRLC WCS did not return geotiff, got {}".format(r.headers.get("content-type")))
    with rasterio.io.MemoryFile(r.content) as memfile:
        with memfile.open() as ds:
            geom = [mapping(buf_deg)]
            data, _ = rasterio.mask.mask(ds, geom, crop=True, filled=True, nodata=255)
            band = data[0]
            valid = band[(band >= 0) & (band <= 100)]
            if valid.size == 0:
                raise RuntimeError("no valid NLCD TCC pixels in buffer")
            pct = float(valid.mean())
    return pct, {
        "source": "MRLC NLCD Tree Canopy Cover 2021, CONUS, v2021-4",
        "access": "MRLC GeoServer WCS 2.0.1, coverage {}".format(MRLC_COVERAGE_ID),
        "url": "https://www.mrlc.gov/geoserver/ows",
        "measurement": "mean percent tree canopy cover across all raster cells (30 m) inside the 2 mile radius buffer, values 0-100 read directly, no cloud or seasonal masking needed since this is an annual land cover product",
        "is_proxy": False,
        "n_pixels": int(valid.size),
    }


def fetch_canopy_osm_fallback(lat, lon, buf_deg):
    import osmnx as ox
    tags = {"landuse": ["forest", "grass", "meadow", "orchard", "vineyard"],
            "natural": ["wood", "grassland", "scrub"],
            "leisure": ["park", "nature_reserve", "golf_course"]}
    gdf = ox.features_from_polygon(buf_deg, tags)
    if gdf.empty:
        pct = 0.0
    else:
        gdf = gdf[gdf.geometry.type.isin(["Polygon", "MultiPolygon"])]
        aeqd = pyproj.CRS.from_proj4(
            "+proj=aeqd +lat_0={} +lon_0={} +units=m +ellps=WGS84".format(lat, lon)
        )
        gdf_m = gdf.to_crs(aeqd)
        buf_m = transform(
            pyproj.Transformer.from_crs("EPSG:4326", aeqd, always_xy=True).transform, buf_deg
        )
        inter_area = gdf_m.geometry.intersection(buf_m).area.sum()
        pct = 100.0 * inter_area / buf_m.area
    return pct, {
        "source": "OpenStreetMap landuse and natural tags (forest, wood, grass, meadow, scrub, park, golf_course)",
        "access": "osmnx features_from_polygon over Overpass API",
        "measurement": "fraction of buffer area covered by vegetated OSM polygons, used as a crude green cover proxy, not a validated tree canopy measurement, will overcount grass and undercount street trees not mapped as polygons",
        "is_proxy": True,
        "proxy_reason": "MRLC WCS request failed or was unreachable",
    }


def search_warm_season_scenes(bbox, year):
    body = {
        "collections": ["landsat-c2-l2"],
        "bbox": bbox,
        "datetime": "{}-06-01/{}-08-31".format(year, year),
        "query": {
            "eo:cloud_cover": {"lt": LST_MAX_CLOUD},
            "platform": {"in": ["landsat-8", "landsat-9"]},
        },
        "sortby": [{"field": "eo:cloud_cover", "direction": "asc"}],
        "limit": LST_SCENES_PER_YEAR,
    }
    r = requests.post(PC_STAC_SEARCH_URL, json=body, timeout=30)
    r.raise_for_status()
    return r.json().get("features", [])


def sign_href(href, retries=2):
    last_exc = None
    for _ in range(retries + 1):
        try:
            resp = requests.get(PC_SAS_SIGN_URL, params={"href": href}, timeout=30)
            resp.raise_for_status()
            return resp.json()["href"]
        except Exception as exc:
            last_exc = exc
            time.sleep(0.5)
    raise last_exc


def fetch_lst_landsat(buf_deg):
    minx, miny, maxx, maxy = buf_deg.bounds
    bbox = [minx, miny, maxx, maxy]

    candidates = []
    for year in LST_YEARS:
        try:
            candidates.extend(search_warm_season_scenes(bbox, year))
        except Exception:
            continue
    if not candidates:
        raise RuntimeError("no warm season Landsat scenes found for this buffer")
    candidates = candidates[:LST_MAX_SCENES]

    pooled = []
    used_scenes = []
    for f in candidates:
        try:
            href = f["assets"]["lwir11"]["href"]
            signed = sign_href(href)
            vsi_path = "/vsicurl/" + signed
            with rasterio.open(vsi_path) as ds:
                to_scene_crs = pyproj.Transformer.from_crs("EPSG:4326", ds.crs, always_xy=True).transform
                geom_scene = transform(to_scene_crs, buf_deg)
                data, _ = rasterio.mask.mask(ds, [mapping(geom_scene)], crop=True, filled=True, nodata=0)
                band = data[0].astype("float64")
                valid_dn = band[band > 0]
                if valid_dn.size == 0:
                    continue
                temp_k = valid_dn * 0.00341802 + 149.0
                temp_c = temp_k - 273.15
                temp_c = temp_c[(temp_c > -10) & (temp_c < 65)]
                if temp_c.size == 0:
                    continue
                pooled.append(temp_c)
                used_scenes.append({
                    "scene_id": f["id"],
                    "date": f["properties"]["datetime"][:10],
                    "cloud_cover_pct": f["properties"].get("eo:cloud_cover"),
                    "n_pixels": int(temp_c.size),
                })
        except Exception:
            continue

    if not pooled:
        raise RuntimeError("no usable Landsat ST_B10 pixels retrieved for this buffer")

    all_temps = np.concatenate(pooled)
    p90 = float(np.percentile(all_temps, 90))
    return p90, {
        "source": "Landsat Collection 2 Level 2, ST_B10 surface temperature band, Landsat 8 and 9",
        "access": "Microsoft Planetary Computer STAC API, collection landsat-c2-l2, asset lwir11, signed via the public SAS token endpoint, read with rasterio over HTTPS",
        "measurement": "90th percentile of all valid 30 m surface temperature pixels inside the 2 mile buffer, pooled across up to {} of the clearest June through August scenes drawn from years {} through {}, one search per year, with reported scene cloud cover under {} percent".format(LST_MAX_SCENES, LST_YEARS[0], LST_YEARS[-1], LST_MAX_CLOUD),
        "qa_caveat": "cloud masking is scene level only, using the published eo:cloud_cover metadata field, there is no per-pixel QA_PIXEL cloud or shadow mask applied inside the buffer, a small number of undetected cloud or shadow pixels inside an otherwise clear scene could bias the pooled percentile",
        "is_proxy": False,
        "n_scenes_used": len(used_scenes),
        "scenes": used_scenes,
    }


def fetch_lst_climatology_fallback(city_name):
    published_warm_season_high_c = {
        "atlanta": 33.0, "boston": 29.0, "dallas": 36.0, "houston": 34.0,
        "kansas_city": 33.0, "los_angeles": 27.0, "miami": 33.0,
        "new_york_new_jersey": 29.0, "philadelphia": 30.0,
        "san_francisco_bay_area": 27.0, "seattle": 25.0,
    }
    uhi_and_surface_offset_c = 10.0
    key = city_name.lower().replace(" ", "_").replace("/", "_")
    base = published_warm_season_high_c.get(key, 32.0)
    p90 = base + uhi_and_surface_offset_c
    return p90, {
        "source": "NOAA/NWS published 1991-2020 warm season (June-August) average daily high air temperature normals, by metro, plus a fixed assumed urban surface-to-air offset",
        "access": "hardcoded table in this script, not fetched live in this run",
        "measurement": "published climatology air temperature normal plus a flat {} C assumed offset to approximate land surface temperature over paved and rooftop surfaces, this is a coarse published-figure proxy, not a per-pixel remote sensing measurement, and it cannot represent the 90th percentile spatial variability inside the actual 2 mile buffer".format(uhi_and_surface_offset_c),
        "is_proxy": True,
        "proxy_reason": "Landsat STAC search or asset fetch failed or was unreachable",
    }


def degmin_from_proxy(canopy_pct, lst_p90_c, k):
    shade_deficit = 1.0 - (canopy_pct / 100.0)
    excess_c = max(lst_p90_c - WBGT_THRESHOLD_C, 0.0)
    return k * excess_c * shade_deficit * NOMINAL_TRIP_MIN


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    method_cities = {}

    for city in CITIES:
        print("processing", city["name"])
        buf_deg, _ = buffer_geometry(city["lat"], city["lon"], BUFFER_M)

        try:
            canopy_pct, canopy_method = fetch_canopy_nlcd(buf_deg)
        except Exception as exc:
            print("  canopy real source failed:", repr(exc))
            canopy_pct, canopy_method = fetch_canopy_osm_fallback(city["lat"], city["lon"], buf_deg)

        try:
            lst_p90_c, lst_method = fetch_lst_landsat(buf_deg)
        except Exception as exc:
            print("  lst real source failed:", repr(exc))
            lst_p90_c, lst_method = fetch_lst_climatology_fallback(city["id"])

        rows.append({
            "id": city["id"],
            "name": city["name"],
            "venue": city["venue"],
            "canopy_pct": round(canopy_pct, 1),
            "lst_p90_c": round(lst_p90_c, 1),
            "matches": city["matches"],
        })
        method_cities[city["id"]] = {
            "venue_coordinates": {"lat": city["lat"], "lon": city["lon"]},
            "venue_coordinates_source": "commonly published venue coordinates, not independently surveyed for this task",
            "buffer_miles": BUFFER_MILES,
            "canopy_pct": canopy_method,
            "lst_p90_c": lst_method,
            "matches": {
                "value": city["matches"],
                "source": "public reporting of the FIFA World Cup 2026 confirmed venue match allocations, announced 2024",
                "access": "not fetched live in this run, entered from general knowledge, must be verified against FIFA's official published match schedule before this number is presented as authoritative",
                "is_proxy": True,
            },
        }
        time.sleep(0.2)

    houston_row = next(r for r in rows if r["id"] == "houston")
    denom = degmin_from_proxy(houston_row["canopy_pct"], houston_row["lst_p90_c"], 1.0)
    if denom <= 0:
        k = 0.0
    else:
        k = HOUSTON_ANCHOR_DEGMIN / denom

    for row in rows:
        row["degmin_per_trip"] = round(
            degmin_from_proxy(row["canopy_pct"], row["lst_p90_c"], k), 1
        )

    ordered_ids = [c["id"] for c in CITIES]
    rows_by_id = {r["id"]: r for r in rows}
    final_rows = [rows_by_id[i] for i in ordered_ids]
    for row in final_rows:
        row_out = {
            "id": row["id"],
            "name": row["name"],
            "venue": row["venue"],
            "degmin_per_trip": row["degmin_per_trip"],
            "canopy_pct": row["canopy_pct"],
            "lst_p90_c": row["lst_p90_c"],
            "matches": row["matches"],
        }
        row.clear()
        row.update(row_out)

    with open(OUT / "cities.json", "w") as f:
        json.dump(final_rows, f, indent=2)

    method_doc = {
        "purpose": "Comparative eleven city ledger, deliberately a lighter weight method than the full raytraced Houston pipeline. This file exists so a reviewer can see exactly which numbers are real measurements and which are documented proxies.",
        "method_summary": {
            "buffer": "2 mile geodesic radius buffer around each venue point, built with an azimuthal equidistant projection centered on the venue, not a bounding box",
            "canopy_pct": "attempted MRLC NLCD Tree Canopy Cover 2021 (CONUS) via the public MRLC GeoServer WCS 2.0.1 endpoint for every city, masked to the exact circular buffer, this succeeded as a real measurement unless a per city fallback note below says otherwise",
            "lst_p90_c": "attempted Landsat Collection 2 Level 2 ST_B10 surface temperature via the Microsoft Planetary Computer STAC API for every city, pooled across the clearest June through August scenes from {} through {} with scene level cloud cover under {} percent, masked to the exact circular buffer, this succeeded as a real measurement unless a per city fallback note below says otherwise".format(LST_YEARS[0], LST_YEARS[-1], LST_MAX_CLOUD),
            "degmin_per_trip": "NOT a measurement. It is a transparent scaled proxy: degmin_per_trip = k * max(lst_p90_c - 32.0, 0) * (1 - canopy_pct/100) * 15 minutes. The 32.0 threshold is the same WBGT threshold used in the full Houston pipeline, reused here directly against land surface temperature as a scale anchor, this is a modeling assumption, land surface temperature is not wet bulb globe temperature and the two are not physically equivalent. The 15 minute nominal trip duration is a single fixed assumption applied to all eleven cities equally, it is not derived from each city's actual station-to-gate walking distance the way the full Houston pipeline does. The canopy shade multiplier (1 - canopy_pct/100) is a linear, non-directional approximation, it ignores where shade actually falls relative to the walking route and ignores building shadow, which the Houston raytraced bake includes and this method does not.",
            "degmin_calibration": "the constant k is solved once so that Houston's degmin_per_trip lands at {} degree-minutes per trip, matching the Houston value shown in docs/contracts.md. That value is a documented example in the frozen data contract, not a verified output of an actual run of the full Houston s2 through s6 raytrace pipeline in this repository, because no such output currently exists in data/out. If and when the full Houston pipeline produces a real number, this calibration anchor should be replaced and every city's degmin_per_trip in cities.json should be regenerated.".format(HOUSTON_ANCHOR_DEGMIN),
        },
        "cities": method_cities,
        "headline_check": "the eleven city comparison is meant to test whether Houston is an outlier among US host cities for pedestrian heat exposure. This script reports whatever the canopy and surface temperature data actually show, including if Houston ranks high, low, or in the middle. See the run report for where Houston actually lands.",
        "known_limitations": [
            "no ray traced shading, no building shadow, no route level shade geometry outside Houston",
            "canopy is measured as area coverage in a buffer, not coverage specifically along pedestrian routes to each stadium",
            "surface temperature is not air temperature and is not WBGT, hot pavement and rooftops read much hotter than a person would experience at head height in shade",
            "match counts are typed from general knowledge in this script and were not fetched from a live FIFA source in this run",
            "venue coordinates are commonly published approximate points, not surveyed stadium entrance locations",
            "Landsat overpass time is roughly 10:30 to 11:00 local solar time, well before the actual kickoff hours the full Houston pipeline studies (15, 17, 19, 21). Late morning surface temperature does not capture afternoon and evening peak heating, so lst_p90_c likely understates the true afternoon and evening surface temperature at every city, including Houston, in a similar direction, but the size of that understatement can vary by city depending on local afternoon heating rate and is not corrected for here",
        ],
    }

    with open(OUT / "cities_method.json", "w") as f:
        json.dump(method_doc, f, indent=2)

    print(json.dumps(final_rows, indent=2))


if __name__ == "__main__":
    main()
