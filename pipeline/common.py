import json
import math
import hashlib
from pathlib import Path
from datetime import datetime, timezone

import yaml
import numpy as np
import pandas as pd
import requests
import networkx as nx
import osmnx as ox
from shapely.geometry import LineString
from pyproj import Transformer

ROOT = Path(__file__).resolve().parent.parent
PIPELINE_DIR = ROOT / "pipeline"
RAW_DIR = ROOT / "data" / "raw"
INTERIM_DIR = ROOT / "data" / "interim"
OUT_DIR = ROOT / "data" / "out"

CFG = yaml.safe_load(open(PIPELINE_DIR / "config.yml"))
COSTS = yaml.safe_load(open(PIPELINE_DIR / "costs.yml"))

CRS_WGS84 = "EPSG:4326"
CRS_METRIC = CFG["site"]["crs_metric"]
LOCAL_TZ = "America/Chicago"
MPH_TO_MS = 0.44704
GLOBE_DIAMETER_M = CFG["walk"].get("globe_diameter_m", 0.15)
PEDESTRIAN_HEIGHT_M = CFG["walk"].get("wind_pedestrian_height_m", 2.0)

TO_UTM = Transformer.from_crs(CRS_WGS84, CRS_METRIC, always_xy=True)
TO_WGS84 = Transformer.from_crs(CRS_METRIC, CRS_WGS84, always_xy=True)

ox.settings.cache_folder = str(RAW_DIR / "osmnx_cache")

ASOS_STATIONS = {
    "KHOU": {"lat": 29.6375, "lon": -95.2824, "elevation_m": 14.0, "name": "HOUSTON/WILL HOBBY"},
    "KIAH": {"lat": 29.9844, "lon": -95.3607, "elevation_m": 28.0, "name": "Houston Intercontinental"},
    "KSGR": {"lat": 29.6222, "lon": -95.6565, "elevation_m": 2.0, "name": "HOUSTON/HULL FIELD"},
}


def ensure_dirs():
    for d in (RAW_DIR / "asos", RAW_DIR / "osm", INTERIM_DIR, OUT_DIR):
        d.mkdir(parents=True, exist_ok=True)


def lonlat_to_utm(lon, lat):
    return TO_UTM.transform(lon, lat)


def utm_to_lonlat(x, y):
    return TO_WGS84.transform(x, y)


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def stable_key(*parts):
    raw = "|".join(str(p) for p in parts)
    return hashlib.sha1(raw.encode("utf8")).hexdigest()[:16]


def cached_get(url, params, cache_dir, name, timeout=30, retries=5):
    cache_dir.mkdir(parents=True, exist_ok=True)
    data_path = cache_dir / f"{name}.csv"
    meta_path = cache_dir / f"{name}.json"
    if data_path.exists() and meta_path.exists():
        return data_path.read_text(), json.loads(meta_path.read_text())
    import time as _time

    wait = 5.0
    resp = None
    last_error = None
    for attempt in range(retries):
        try:
            resp = requests.get(url, params=params, timeout=timeout)
        except requests.exceptions.RequestException as exc:
            last_error = exc
            _time.sleep(wait)
            wait *= 2
            continue
        if resp.status_code != 429:
            break
        _time.sleep(wait)
        wait *= 2
    if resp is None:
        raise last_error
    resp.raise_for_status()
    text = resp.text
    meta = {
        "url": resp.url,
        "params": params,
        "fetched_utc": now_iso(),
        "status_code": resp.status_code,
        "bytes": len(text),
    }
    data_path.write_text(text)
    meta_path.write_text(json.dumps(meta, indent=2))
    return text, meta


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2))


def read_json(path):
    return json.loads(Path(path).read_text())


def kickoff_hours():
    return [int(h) for h in CFG["hours"]]


def match_dates():
    return [str(d) for d in CFG["match_dates"]]


def asos_day(station, date_str):
    from io import StringIO

    name = f"{station}_{date_str}"
    url = "https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py"
    params = {
        "station": station,
        "data": "tmpc,dwpc,sped,alti,mslp",
        "year1": date_str[0:4],
        "month1": date_str[5:7],
        "day1": date_str[8:10],
        "hour1": 0,
        "year2": date_str[0:4],
        "month2": date_str[5:7],
        "day2": str(int(date_str[8:10]) + 1).zfill(2),
        "hour2": 0,
        "tz": "America/Chicago",
        "format": "onlycomma",
        "latlon": "no",
        "elev": "no",
        "missing": "M",
        "trace": "T",
        "direct": "no",
        "report_type": 3,
    }
    text, meta = cached_get(url, params, RAW_DIR / "asos", name, timeout=60)
    df = pd.read_csv(StringIO(text), na_values=["M"])
    df["valid"] = pd.to_datetime(df["valid"])
    return df


def pedestrian_wind(wind_ms):
    walk = CFG["walk"]
    z_ref = walk.get("wind_measurement_height_m", 10.0)
    z_ped = walk.get("wind_pedestrian_height_m", 2.0)
    z0 = walk.get("surface_roughness_m", 0.03)
    if wind_ms <= 0 or z_ped <= z0:
        return max(wind_ms, 0.0)
    factor = math.log(z_ped / z0) / math.log(z_ref / z0)
    return max(wind_ms * factor, 0.5)


def station_hour_obs(station, date_str, hour):
    df = asos_day(station, date_str)
    match = df[df["valid"].dt.hour == hour]
    if match.empty:
        return None
    row = match.iloc[0]
    if pd.notna(row["mslp"]):
        pres_hpa = float(row["mslp"])
    elif pd.notna(row["alti"]):
        pres_hpa = float(row["alti"]) * 33.8639
    else:
        return None
    if pd.isna(row["tmpc"]) or pd.isna(row["dwpc"]) or pd.isna(row["sped"]):
        return None
    wind_10m = float(row["sped"]) * MPH_TO_MS
    return {
        "tair_c": float(row["tmpc"]),
        "tdew_c": float(row["dwpc"]),
        "wind_ms": pedestrian_wind(wind_10m),
        "wind_ms_10m": wind_10m,
        "pres_hpa": pres_hpa,
        "valid": str(row["valid"]),
    }


def hottest_date_for_hour(hour):
    cache_path = INTERIM_DIR / "hour_dates.json"
    table = read_json(cache_path) if cache_path.exists() else {}
    key = str(hour)
    if key in table:
        return table[key]
    dates = match_dates()
    stations = list(ASOS_STATIONS.keys())
    best_date, best_mean = None, None
    for d in dates:
        vals = []
        for s in stations:
            o = station_hour_obs(s, d, hour)
            if o is not None:
                vals.append(o["tair_c"])
        if not vals:
            continue
        mean_tair = float(np.mean(vals))
        if best_mean is None or mean_tair > best_mean:
            best_mean, best_date = mean_tair, d
    if best_date is None:
        raise RuntimeError(f"no ASOS observations available across stations for hour {hour}")
    table[key] = best_date
    write_json(cache_path, table)
    return best_date


def load_graph_projected():
    g = ox.load_graphml(INTERIM_DIR / "walk_graph.graphml")
    return ox.projection.project_graph(g, to_crs=CRS_METRIC)


def stadium_gates():
    path = RAW_DIR / "osm" / "nrg_stadium.geojson"
    meta_path = RAW_DIR / "osm" / "nrg_stadium.json"
    import geopandas as gpd

    if path.exists():
        gdf = gpd.read_file(path)
    else:
        tags = {"building": "stadium"}
        point = (CFG["site"]["lat"], CFG["site"]["lon"])
        gdf = ox.features_from_point(point, tags, dist=400).reset_index()
        path.parent.mkdir(parents=True, exist_ok=True)
        gdf.to_file(path, driver="GeoJSON")
        write_json(
            meta_path,
            {
                "source": "OpenStreetMap via Overpass API, osmnx.features_from_point",
                "tags": tags,
                "point_latlon": list(point),
                "dist_m": 400,
                "fetched_utc": now_iso(),
                "note": "no entrance nodes tagged on this way, gates approximated as 8 evenly spaced perimeter points",
            },
        )
    poly = gdf.geometry.iloc[0]
    cx, cy = poly.centroid.x, poly.centroid.y
    gates = []
    for ang_deg in range(0, 360, 45):
        rad = math.radians(ang_deg)
        far = (cx + 0.02 * math.sin(rad), cy + 0.02 * math.cos(rad))
        ray = LineString([(cx, cy), far])
        inter = ray.intersection(poly.exterior)
        if inter.is_empty:
            continue
        pt = inter if inter.geom_type == "Point" else list(inter.geoms)[0]
        gates.append((pt.x, pt.y))
    return gates


def compute_routes():
    cache_path = INTERIM_DIR / "routes.json"
    if cache_path.exists():
        return read_json(cache_path)
    gp = load_graph_projected()
    gate_lonlat = stadium_gates()
    gate_xy = [lonlat_to_utm(lo, la) for lo, la in gate_lonlat]
    gate_nodes = list(
        dict.fromkeys(
            int(n)
            for n in ox.distance.nearest_nodes(
                gp, X=[p[0] for p in gate_xy], Y=[p[1] for p in gate_xy]
            )
        )
    )
    routes = {}
    for key, o in CFG["origins"].items():
        x, y = lonlat_to_utm(o["lon"], o["lat"])
        onode = int(ox.distance.nearest_nodes(gp, X=x, Y=y))
        best = None
        for gn in gate_nodes:
            if gn not in gp:
                continue
            try:
                length = nx.shortest_path_length(gp, onode, gn, weight="length")
            except nx.NetworkXNoPath:
                continue
            if best is None or length < best[0]:
                path = nx.shortest_path(gp, onode, gn, weight="length")
                best = (length, path, gn)
        length, path, gate_node = best
        coords = []
        edge_names = []
        for u, v in zip(path[:-1], path[1:]):
            edge_data = min(
                gp.get_edge_data(u, v).values(), key=lambda d: d.get("length", 0)
            )
            geom = edge_data.get("geometry")
            if geom is not None:
                pts = list(geom.coords)
            else:
                pts = [
                    (gp.nodes[u]["x"], gp.nodes[u]["y"]),
                    (gp.nodes[v]["x"], gp.nodes[v]["y"]),
                ]
            if coords and coords[-1] == pts[0]:
                pts = pts[1:]
            start_idx = len(coords)
            coords.extend(pts)
            name = edge_data.get("name")
            if isinstance(name, list):
                name = name[0]
            edge_names.append({"name": name, "start_idx": start_idx, "end_idx": len(coords) - 1})
        routes[key] = {
            "origin_node": onode,
            "gate_node": gate_node,
            "length_m": length,
            "coords_utm": coords,
            "edge_names": edge_names,
            "label": o["label"],
        }
    write_json(cache_path, routes)
    return routes


def get_raster_bounds(margin_m=200.0):
    cache_path = INTERIM_DIR / "raster_bounds.json"
    if cache_path.exists():
        return read_json(cache_path)
    routes = compute_routes()
    xs, ys = [], []
    for r in routes.values():
        for x, y in r["coords_utm"]:
            xs.append(x)
            ys.append(y)
    res = CFG["raster"]["resolution_m"]
    minx = min(xs) - margin_m
    miny = min(ys) - margin_m
    width = int(np.ceil((max(xs) + margin_m - minx) / res))
    height = int(np.ceil((max(ys) + margin_m - miny) / res))
    maxx = minx + width * res
    maxy = miny + height * res
    w0, s0 = utm_to_lonlat(minx, miny)
    e0, n0 = utm_to_lonlat(maxx, maxy)
    bounds = {
        "crs": CRS_METRIC,
        "resolution_m": res,
        "minx": minx,
        "miny": miny,
        "maxx": maxx,
        "maxy": maxy,
        "width": width,
        "height": height,
        "lonlat_bounds": [w0, s0, e0, n0],
    }
    write_json(cache_path, bounds)
    return bounds


def grid_centers_utm(bounds):
    res = bounds["resolution_m"]
    height = bounds["height"]
    width = bounds["width"]
    col = np.arange(width)
    row = np.arange(height)
    xs = bounds["minx"] + (col + 0.5) * res
    ys = bounds["maxy"] - (row + 0.5) * res
    xx, yy = np.meshgrid(xs, ys)
    return xx, yy


def grid_centers_lonlat(bounds):
    xx, yy = grid_centers_utm(bounds)
    lon, lat = TO_WGS84.transform(xx.ravel(), yy.ravel())
    return np.asarray(lon).reshape(xx.shape), np.asarray(lat).reshape(yy.shape)


def idw_grid(bounds, station_values, power=2.0):
    xx, yy = grid_centers_utm(bounds)
    grid = np.zeros_like(xx, dtype=np.float64)
    wsum = np.zeros_like(xx, dtype=np.float64)
    for code, val in station_values.items():
        sx, sy = lonlat_to_utm(ASOS_STATIONS[code]["lon"], ASOS_STATIONS[code]["lat"])
        d2 = (xx - sx) ** 2 + (yy - sy) ** 2
        w = 1.0 / np.power(d2, power / 2.0)
        grid += w * val
        wsum += w
    return (grid / wsum).astype(np.float32)


def compute_wbgt_grid(bounds, tair_grid, tdew_grid, wind_grid, pres_grid, ghi_value, utc_dt):
    from metpy.units import units
    from pywbgt import liljegrenWBGT

    lon_grid, lat_grid = grid_centers_lonlat(bounds)
    n = tair_grid.size
    dt_index = pd.DatetimeIndex([utc_dt] * n)
    out = liljegrenWBGT(
        dt_index,
        lat_grid.ravel(),
        lon_grid.ravel(),
        np.full(n, ghi_value) * units("W/m^2"),
        pres_grid.ravel() * units.hPa,
        tair_grid.ravel() * units.degC,
        tdew_grid.ravel() * units.degC,
        wind_grid.ravel() * units("m/s"),
        d_globe=GLOBE_DIAMETER_M * units.m,
        zspeed=PEDESTRIAN_HEIGHT_M * units.m,
    )
    return np.asarray(out["Twbg"], dtype=np.float32).reshape(tair_grid.shape)


def station_grids(bounds, station_stats):
    tair_grid = idw_grid(bounds, {s: v["tair_c"] for s, v in station_stats.items()})
    tdew_grid = idw_grid(bounds, {s: v["tdew_c"] for s, v in station_stats.items()})
    wind_grid = idw_grid(bounds, {s: v["wind_ms"] for s, v in station_stats.items()})
    pres_grid = idw_grid(bounds, {s: v["pres_hpa"] for s, v in station_stats.items()})
    return tair_grid, tdew_grid, wind_grid, pres_grid


def raster_transform(bounds):
    from rasterio.transform import from_origin

    return from_origin(bounds["minx"], bounds["maxy"], bounds["resolution_m"], bounds["resolution_m"])
