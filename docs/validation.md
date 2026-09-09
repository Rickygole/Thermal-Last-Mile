# Validation

This document states what was checked against an independent observation, what was not,
and what the checks actually show. Every number below is read from a file the pipeline
wrote; the file and field it came from is named next to it so a reader can recompute it.

## The headline claim, stated precisely

We validate the spatial interpolation of station air temperature observations. We do not
validate the Liljegren wet bulb globe temperature model itself. No instrumented WBGT
record exists for this site and these dates, so there is nothing to compare the model's
WBGT output against directly. This distinction is not a footnote; it is the single most
important thing to understand about the rigour of this submission, and conflating the two
would misrepresent what has actually been checked.

## What was validated: the meteorological interpolation

The pipeline estimates air temperature, dew point, wind and pressure at every 1 m grid
cell by inverse distance weighting three ASOS stations, KHOU, KIAH and KSGR, each 10 to 40
km from the study site. `data/out/meta.json`, key `validation`, reports a leave one out
cross validation of exactly that interpolation: each station's observation is predicted
from the other two and compared against what that station actually recorded, across all
10 modelled kickoff hours and the hottest of the three configured match dates selected for
each hour.

- RMSE: 1.05 C
- Bias: 0.03 C
- Stations held out: 3
- Samples: 30 (3 stations times 10 kickoff hours)
- Quantity validated: air temperature only

Source: `data/out/meta.json`, `validation.rmse_c`, `validation.bias_c`,
`validation.n_stations`, `validation.n_samples`. The computing method is
`pipeline/meta.py`, function `leave_one_out_validation`.

A 1.05 C RMSE with a near zero bias means the interpolation is not systematically hot or
cold; the error is close to random and of a size consistent with three stations that are
themselves tens of kilometres apart. It is also, by construction, an estimate of how well
distant airport stations describe conditions at a stadium approach they do not sit inside,
not an estimate of how well the pipeline reproduces a heat index at that stadium approach.

This figure is consistent with the pipeline's own stated input uncertainty: the Monte
Carlo air temperature perturbation used for `degmin_lo` and `degmin_hi` on every segment
(`pipeline/s5_routes.py`, `tair_tolerance_c`) is set to 1.0 C, close to the measured 1.05 C
RMSE, and is explicitly described there as covering ASOS sensor accuracy of about 0.6 C
plus this same representativeness error.

## What was not validated: the WBGT model, and the resulting degree minute figures

There is no field WBGT instrument at NRG Stadium's approaches for the 2026 match dates,
so the Liljegren model's output cannot be checked against an observation at any point in
this pipeline. Every degree-minute, fan-hour, and dollar-per-degree-minute figure in this
project inherits the interpolation's honest 1.05 C RMSE, plus whatever additional error
the WBGT physics itself carries, which is unmeasured here. Readers should treat the
absolute magnitude of every headline number as a model estimate under stated assumptions,
not as a measurement with an instrument behind it. The ranking of segments relative to one
another, which is what the shade budget optimizer actually uses, is far more robust to
this than the absolute magnitude is, since a shared interpolation error moves every
segment in the same direction.

## The segment-level uncertainty band, and what it does and does not cover

Every segment in `data/out/segments.geojson` carries `degmin_lo` and `degmin_hi` alongside
`degmin`. These are the 5th and 95th percentiles of a 128-draw Monte Carlo over four
meteorological inputs (`pipeline/s5_routes.py`, `UNCERTAINTY_META`):

- air temperature: additive, field-wide, normal, standard deviation 1.0 C
- dew point: additive, field-wide, normal, standard deviation 1.5 C, clipped to not
  exceed air temperature
- wind speed: multiplicative, lognormal, 5th to 95th percentile multiplier about 0.56 to
  1.78, deliberately wide because airport wind extrapolated to 2 m pedestrian height says
  little about ventilation inside a specific street canyon
- irradiance: multiplicative, uniform on 0.70 to 1.00 of the clear sky value, one sided
  because clear sky is a physical upper bound and any real cloud can only reduce it

Held fixed and not sampled: the 150 mm globe diameter, the land surface temperature
coupling coefficient, the building shade mask geometry, the diffuse sky fraction, the
ground albedo, walking speed, approach mode share, and the 28 C threshold itself. The
pipeline's own metadata is explicit that switching the globe diameter alone, from the ISO
150 mm value to the 50.8 mm library default, moves the headline number by more than the
whole reported band. The reported interval is therefore a lower bound on total
uncertainty, not a full propagation, and it says so in the file it ships in.

An aggregate version of this band for any headline total is recoverable directly from
`segments.geojson` without re-running the pipeline: the total fan-hours figure for a given
kickoff hour is computed as the sum, over every segment, of that segment's fan count times
its `degmin` for that hour, divided by 60 (`pipeline/s10_kickoff.py`,
`fan_hours_above_threshold`). Substituting `degmin_lo` and `degmin_hi` for `degmin` in that
same formula gives an honest low and high aggregate. Doing this for the 15:00 baseline
kickoff gives approximately 50,000 to 93,000 fan-degree-hours around the central estimate
reported in `data/out/kickoff_clock.json` (`hours.15.fan_hours_above_threshold`).

Evaluating that same hour sweep at the seven real kickoff hours gives a central 352,554
with a band of 224,057 to 493,735, which is minus 36 percent and plus 40 percent. That
band is indicative for the measured tournament total of 297,665 rather than computed on
it, because the retrospective in `data/out/retrospective.json` uses each match's own
observed weather while the sweep uses one representative date per hour. The two are
different quantities and the sweep total is the larger of them, so the band should be read
as a scale for the uncertainty rather than as bounds on the measured figure.

Both bands are wide, and a hinge function like degree-minutes above a fixed threshold has
a large local condition number, so a wide band here is the honest result of the underlying
physics, not a sign the model is loosely built.

## Substitutions made in place of measured or licensed inputs, and their expected bias

Three inputs are substitutes for a better source that was either unavailable, keyed, or
not fetched. Each is recorded in `data/out/meta.json` under `sources`, and each has a
predictable direction of bias.

**OpenStreetMap building footprints instead of a LiDAR digital surface model.** Building
heights are read from OSM tags where present, falling back to `building:levels` times 3.5
m per storey, and to a flat 3.5 m single storey default where neither tag exists (783
buildings rasterized, `data/out/meta.json`, `sources[].n_buildings_rasterized`). Buildings
missing from OSM, or mapped without a height tag and defaulted low, cast less shadow than
they should, which understates shade coverage and biases exposure high in exactly the
places tagging is weakest. There is no equivalent mechanism that would bias exposure low,
so the expected direction is a net overstatement of sun exposure, of unknown magnitude,
concentrated wherever OSM building data is sparse.

**Clear sky irradiance (pvlib Ineichen model) instead of measured NSRDB irradiance.** The
NREL NSRDB API requires a registered key that was not available in this environment, so
every irradiance value in this pipeline is a clear sky physical ceiling, not an observed
value. Cloud cover only ever reduces irradiance below that ceiling, never raises it above
it, so this substitution has one knowable direction: it biases modelled heat exposure high
on any day with cloud cover, and reproduces the true value only on an actually clear day.
It cannot bias exposure low.

**A late morning Landsat land surface temperature pattern used as a spatial proxy for
afternoon and evening conditions.** Landsat 8 and 9 cross Houston near 10:30 to 11:00
local solar time; the kickoff hours this pipeline studies run 12:00 to 21:00. The Landsat
field supplies only the spatial pattern of hotter and cooler surfaces (an anomaly, applied
as `tair_cell = tair_station_interpolated + beta * (lst_cell - lst_area_mean)`, `beta` =
0.2), not the absolute temperature level, which continues to come from the same-hour ASOS
stations. The built environment that creates the pattern, pavement versus tree canopy
versus parking structure, does not move between late morning and evening, which is why
this is a defensible proxy rather than a wrong one. But the two are still not the same
observation: if the contrast between hot and cool surfaces is systematically larger in the
afternoon heat peak than at a cooler late morning overpass, this proxy would understate the
true spatial spread of afternoon exposure, and if the contrast is instead larger in the
morning, it would overstate it. Neither direction is measured here; the sign of this
particular bias is unknown, unlike the other two substitutions above.

## The organiser data checks: informal, and one of them was rejected outright

Two checks against the hackathon organisers' sample datasets were run. Neither is a
validation of this pipeline's physics in the sense the ASOS leave-one-out test is; both
carry the organisers' own disclosed noise and are reported at face value.

**Urban heat index corroboration**, `data/out/uhi_validation.json`: of 80,959 organiser
heat index points inside the Houston market, 210 fall inside this project's study
bounding box. Rank correlation (Spearman) between the organisers' 1-to-11 ordinal index
and this pipeline's own Landsat-derived heat anomaly at those points is 0.147; the linear
correlation (Pearson) is 0.193. Given the small sample, the organisers' disclosed additive
noise, and the coarse ordinal scale of their index, this test has very little statistical
power in either direction. It neither corroborates nor contradicts the Landsat field, and
it is not presented here as support for it.

**Derived fan volumes**, `data/out/fan_volumes.json`: an attempt was made to replace the
invented approach mode shares with shares estimated from the organisers' point-of-interest
and store-visit sample data. The result was rejected. The derived share for the fan fest
approach disagreed with the prior invented share by a factor of 6.29, and the method has a
disclosed structural blind spot: a stadium surface parking lot such as Lot C contains
almost no commercial points of interest of its own, so a point-of-interest density proxy
cannot see genuine gameday parking-lot foot traffic at all. Rather than smooth over a
disagreement this large, the pipeline fell back to the original invented mode share
constants (`pipeline/s5_routes.py`, `INVENTED_APPROACH_MODE_SHARE`), and `meta.json`
records the fallback as `mode_share_source: invented_fallback_implausible_organizer_data`.
This is a rejection worth being explicit about: it would have been easy to report the
organiser-derived shares as an evidence-based improvement, and they were not used because
the evidence did not hold up.

## Summary

| Check | What it validates | Result | Honest scope |
| --- | --- | --- | --- |
| ASOS leave-one-out cross validation | spatial interpolation of station air temperature | RMSE 1.05 C, bias 0.03 C, n=30 | not a validation of WBGT or of degree-minute output |
| Organiser urban heat index | rank agreement with the Landsat heat anomaly | Spearman 0.147, Pearson 0.193, n=210 | underpowered, inconclusive in either direction |
| Organiser fan volumes | evidence-based approach mode share | rejected, 6.29x disagreement, structural blind spot on parking lots | fell back to a stated invented assumption |

Nothing in this project has been checked against an instrumented WBGT record, because
none exists for this site and these dates. That is the honest limit of this submission's
validation, and every downstream number should be read with that limit in mind.
