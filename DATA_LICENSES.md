# Data licences and attribution

Code in this repository is MIT licensed. Data products carry the licences of
their providers, recorded per layer in `data/out/meta.json`.

| Source | Products derived here | Licence | Obligation met by |
| --- | --- | --- | --- |
| OpenStreetMap | `segments.geojson`, `buildings.geojson`, the walk graph, the building surface model, venue footprint and gates | ODbL 1.0 | Attribution shown on every map view in the application, and stated here. Derived geometry is published under ODbL. |
| Landsat Collection 2 Level 2 (USGS) | surface temperature field, city ledger LST | public domain | credited in `meta.json` and the methods panel |
| NLCD Tree Canopy Cover 2021 (MRLC) | city ledger canopy | public domain | credited in `meta.json` |
| ASOS via Iowa Environmental Mesonet | meteorological inputs | public domain | credited in `meta.json` |
| CARTO basemap tiles | basemap only, not redistributed | CARTO terms | attribution shown on map |
| Hackathon organiser datasets | aggregate corroboration only, in `uhi_validation.json`, `fan_volumes.json`, `organizer_weather.json` | confidential, competition use only | raw records are never committed. `data/raw/` is gitignored. Only aggregates appear in outputs, each carrying the organisers' sample data limitation statement. |

## ODbL note

The pedestrian network, building footprints and derived segment geometry are a
produced work from OpenStreetMap data. They are attributed above and on screen,
and are made available under the same ODbL terms.

## Organiser data note

The organisers state their datasets are transformed sample data with noise added
to magnitudes and temperatures and jittered coordinates, and that conclusions
drawn from them must not be treated as assessments of any real city, venue or
area. No organiser derived figure is presented here as a measurement of Houston.
