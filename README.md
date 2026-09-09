# Thermal Last Mile

Segment level heat exposure on the walk from the METRORail Stadium Park / Astrodome
platform to the NRG Stadium gates, priced per degree-minute averted.

The walk from the train to the gate is the hottest part of a World Cup trip and nobody
measures it. This project measures it, ranks every sidewalk segment by how much
dangerous heat a fan actually absorbs crossing it, and reports where a fixed shade
budget removes the most exposure per dollar.

The headline the project exists to support: **X fan-hours of dangerous heat exposure
happened on the last mile to NRG, Y percent of it was avoidable for Z dollars, and here
is the ranked list of where.**

## The metric

Degree-minutes above WBGT 32, accumulated by one fan walking a segment at 1.3 m/s.

Wet bulb globe temperature is the heat stress standard used by OSHA, the military and
athletics governing bodies, because it combines dry bulb temperature, humidity, wind and
radiant load. Plain air temperature does not describe what a body on a sidewalk
experiences. WBGT 32 is the continuous exertion limit.

Exposure is integrated along the path rather than sampled at a point. Two projects can
report the same peak temperature. Only one can say how long a fan spent above the
threshold and where the shaded relief happened to fall.

## Screens

### The Walk

One fan journey, platform to gate, with the exposure profile beneath it and particles
running the path recoloured by shade.

![The Walk](docs/img/walk.png)

### The Map

The working view. Segment exposure across the catchment, a ranked list, a shade budget
bar, an hour scrubber, and a methods panel that stays on screen.

![The Map](docs/img/map.png)

### The Ledger

Eleven host cities sorted by exposure per fan trip, Houston highlighted. This is the
comparative claim, and it deliberately uses a lighter method than the Houston model.

![The Ledger](docs/img/ledger.png)

### The Transfer

The same method applied to LA 2028 venue geography, which is the legacy argument.

![The Transfer](docs/img/transfer.png)

## How it works

The physics runs offline and the browser only draws.

```
                    OFFLINE                          STATIC              BROWSER

  ASOS  NSRDB  Landsat  LiDAR  OSM  GTFS
        |
   s1 network      OSM pedestrian graph
   s2 wbgt         Liljegren WBGT per cell per hour
   s3 shadow       vectorised raymarch, boolean shade mask   -->  shade_{hh}.png
   s4 surface      exposure raster per kickoff hour
   s5 routes       route, split, integrate along path        -->  segments.geojson
   s6 optimize     greedy submodular, 81 budget levels       -->  solutions.json
   s7 cities       eleven city comparison                    -->  cities.json
   meta            provenance generated, never typed         -->  meta.json
                                                                        |
                                                                   renderer
```

If a value can appear on screen, it exists on disk before the browser opens. The budget
slider does not solve an optimization, it indexes an array. The hour scrubber does not
compute a shadow, it crossfades two baked masks. There is no server, no API and no
database, so there is nothing to cold start, exceed a quota, or go down during judging.

### Shade enters the physics correctly

Shade is computed in the raster domain as a boolean mask per cell, which can be
multiplied, summed and integrated along a path. A shadow rendered as a WebGL lighting
effect darkens pixels on a screen and cannot produce a number.

A shaded pedestrian receives diffuse irradiance only, so shade enters the WBGT
calculation by removing the direct beam from the solar input, not by subtracting an
invented constant from globe temperature. Verified on representative late June Houston
conditions, the same block at the same hour is WBGT 32.8 in full sun and 30.0 in shade.

### Allocation

Shade placement under a budget is a constrained facility location problem with a
submodular coverage objective. Greedy selection on a submodular function carries a
proven approximation guarantee of 1 - 1/e, roughly 63 percent of optimal, and runs in
seconds. The full budget path is solved once offline across 81 levels, so dragging the
slider is an array lookup with no latency and no failure mode.

## Data sources

| Layer | Product | Provider |
| --- | --- | --- |
| Surface temperature | Landsat 8/9 Collection 2 Level 2 ST_B10 | USGS EarthExplorer |
| Air temp, dew point, wind | ASOS hourly, KHOU, KIAH, KSGR | Iowa Environmental Mesonet |
| Solar irradiance | NSRDB PSM v3 | NREL |
| Building heights | LiDAR derived DSM, building footprints as fallback | TNRIS, USGS 3DEP |
| Canopy | NLCD Tree Canopy Cover 2021 | MRLC |
| Sidewalks | OSM pedestrian network, 12,121 nodes and 32,397 edges | OpenStreetMap |
| Transit | METRO GTFS, Red Line platform geometry | Houston METRO |
| Vulnerability | Social Vulnerability Index, tract level | CDC / ATSDR |
| Regional planning | Regional GIS Data Hub | H-GAC |
| Public works | Open Data Hub | Houston Public Works |

The last two come from the curated hackathon source catalog, vendored at
`data/raw/organizers/` and named in the on screen methods panel.

Every product identifier, acquisition date, model citation and cost source is generated
into `meta.json` by the pipeline rather than typed, so provenance cannot drift out of
date, and it is rendered in the interface rather than hidden in an appendix.

## Repository layout

```
pipeline/     offline stages, config.yml and costs.yml
data/raw/     downloads, gitignored, sidecar JSON per request
data/interim/ rasters, gitignored
data/out/     committed application payload
web/          Vite, React, MapLibre GL JS, deck.gl, zustand
docs/         contracts, narrative, validation, provenance
```

## Running it

Pipeline:

```
uv venv --python 3.11 .venv
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python pipeline/run_all.py
```

Stages skip any output that already exists. Pass `--force` to rebuild.

Application:

```
cd web
npm install
npm run dev
npm run build
```

## Design

Dark base, two colour encodings and no more: one sequential ramp for exposure, one accent
for interventions. A judge seeing the map for the first time can hold two encodings in
their head, not four.

| Token | Value |
| --- | --- |
| Page | `#15171B` |
| Panel | `#1D2128` |
| Border | `#2E353E` |
| Text | `#E7E9EC` and `#8B929B` |
| Exposure low | `#97C459` |
| Exposure moderate | `#EF9F27` |
| Exposure severe | `#E24B4A` |
| Intervention | `#2DA2BB` |

Performance targets: first paint under 2 s, hour change to recolour under 250 ms, budget
drag at 60 fps with zero recompute, and zero network calls after load beyond basemap
tiles.

## Output for a public works department

The Map screen exports the ranked segment list as CSV with costs attached, so the result
is an artifact an agency can open on Monday rather than only a demo.

## Status

The application runs end to end. Screens above are rendered from contract shaped
provisional data while the physics pipeline finishes; the interface shows a PROVISIONAL
DATA chip whenever that is true, and the chip disappears when real pipeline output
replaces it. No code changes when the data is swapped, because both halves were built
against a frozen contract.

## Licence

Code under MIT. Data products retain the licences of their providers, recorded per layer
in `meta.json`.
