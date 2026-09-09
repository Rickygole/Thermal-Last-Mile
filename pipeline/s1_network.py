import json
import yaml
import osmnx as ox
import geopandas as gpd
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CFG = yaml.safe_load(open(ROOT / "pipeline" / "config.yml"))

FILTER = (
    '["highway"]["area"!~"yes"]'
    '["highway"!~"motorway|motorway_link|trunk_link|construction|proposed|raceway"]'
    '["foot"!~"no"]["access"!~"private"]'
)


def fetch():
    site = CFG["site"]
    dist = site["buffer_miles"] * 1609.34
    g = ox.graph_from_point(
        (site["lat"], site["lon"]),
        dist=dist,
        custom_filter=FILTER,
        simplify=True,
        retain_all=False,
    )
    return g


def main():
    out = ROOT / "data" / "interim"
    out.mkdir(parents=True, exist_ok=True)
    g = fetch()
    ox.save_graphml(g, out / "walk_graph.graphml")
    nodes, edges = ox.graph_to_gdfs(g)
    edges = edges.reset_index()
    print("nodes", len(nodes), "edges", len(edges))
    print("named streets", edges["name"].notna().sum())
    named = edges[edges["name"].notna()]["name"].astype(str)
    print(named.value_counts().head(15).to_string())
    edges.to_file(out / "walk_edges.gpkg", driver="GPKG")


if __name__ == "__main__":
    main()
