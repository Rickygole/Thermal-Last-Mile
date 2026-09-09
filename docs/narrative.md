# The Thermal Last Mile: methods and results

## The problem

A World Cup ticket gets a fan through the gate. It does not get them from the train
platform or the parking lot to the gate, and that walk is where a Houston summer
afternoon actually does its work. Attendance counts, stadium HVAC specifications and
even air temperature forecasts are all measured routinely. The specific minutes a body
spends exposed to heat stress while walking a named sidewalk segment from the METRORail
Stadium Park / Astrodome platform, from the NRG Lot C surface parking, from the Kirby
Drive rideshare zone, or from the Fan Fest site, to one of NRG Stadium's gates, are not
measured by anyone. This project measures exactly that stretch, segment by segment,
minute by minute, for the four pedestrian approaches to NRG Stadium.

The 2026 FIFA World Cup matches at NRG Stadium ran from 14 June to 4 July 2026. That
window has already passed. Everything in this project is therefore a retrospective
measurement of heat exposure that fans, on foot, actually experienced during a decision
that organisers had already made, not a forecast of a future event. That framing matters:
the schedule analysis below is not a recommendation for a hypothetical future tournament,
it is a quantified account of what an already-taken scheduling decision cost, and a
transferable method for venues where the equivalent decision has not yet been made, such
as the 2028 Los Angeles Olympics stadium.

## The metric, and why these specific choices

**Wet bulb globe temperature, not air temperature.** Air temperature alone describes
almost nothing about what a pedestrian's body experiences on a sunlit sidewalk. Wet bulb
globe temperature (WBGT) combines dry bulb temperature, humidity, wind and radiant heat
load into a single index, and it is the standard already used by OSHA, the US military,
and athletics governing bodies for exactly this purpose: deciding when continued outdoor
exertion becomes dangerous. This project computes WBGT with the Liljegren model
(Liljegren, J.C. et al. 2008, Journal of Occupational and Environmental Hygiene 5(10)
645-655), implemented in `pywbgt`, on a 150 mm globe, the diameter specified by ISO 7243.
The library's own default globe diameter is 50.8 mm, a different instrument, and using it
would shift every downstream number materially; this is recorded directly in the
pipeline's uncertainty metadata rather than left as a silent default.

**Degree-minutes above a threshold, integrated along the walked path, not a single peak
reading.** Two projects can report an identical peak temperature for a study area. Only
one of them can say how long a specific pedestrian spent above a danger threshold, and
where along their actual route the shade did or did not fall. This project segments each
approach into roughly 20 m walk segments (`walk.segment_length_m` in
`pipeline/config.yml`), samples WBGT and shade every 2 m along each segment
(`walk.sample_spacing_m`), and accumulates degree-minutes above the threshold at a walking
speed of 1.3 m/s (Fitzpatrick, K. et al. 2006, Transportation Research Record 1982), the
speed constant cited in `pipeline/costs.yml`.

**28 C, not 32 C, as the primary threshold.** `pipeline/config.yml` fixes
`walk.wbgt_threshold_c` at 28.0 and carries a separate, higher `walk.wbgt_extreme_c` at
32.0 as an extra tier. 28 C WBGT is consistent with published continuous-exertion heat
stress guidance for unacclimatised people doing light to moderate work (the constant is
documented in `pipeline/costs.yml` as ACSM and OSHA continuous exertion guidance, and sits
at the same level as the widely used NIOSH unacclimatised action limit for light work). A
family walking from a car park in street clothes is exactly that population: unacclimatised
and doing light to moderate exertion, not an acclimatised athlete under heavy exertion,
which is the population the higher 32 C tier actually describes. Reporting exposure only
against 32 C, as the athletic-exertion threshold, would understate real fan exposure by a
wide margin; 32 C is retained here only as a second, more extreme tier so that a
"how much of this crossed into genuinely dangerous territory" question can still be
answered separately.

## Method, stage by stage

The physics runs entirely offline, once, and writes its results to the files this
narrative cites. Nothing in the browser recomputes a model at view time.

1. **Pedestrian network (`pipeline/s1_network.py`).** The OpenStreetMap pedestrian graph
   inside a 2 mile buffer of the NRG Stadium site coordinate (`pipeline/config.yml`,
   `site.buffer_miles`) is pulled via `osmnx`, and the four fixed approach origins
   (`pipeline/config.yml`, `origins`) are located on it.

2. **WBGT per cell, per kickoff hour (`pipeline/s2_wbgt.py`).** For each of the ten
   modelled kickoff hours (12:00 through 21:00 local, `pipeline/config.yml`, `hours`),
   the pipeline pulls hourly ASOS observations for three stations, KHOU, KIAH and KSGR,
   from the Iowa Environmental Mesonet archive. Each hour independently selects, from the
   three configured 2026 match dates, whichever single date had the hottest mean observed
   air temperature across the three stations, so a real hot day is not averaged away by
   cooler sampled days (`data/out/meta.json`, `sources[].date_selection_note`). Those
   three station observations are interpolated by inverse distance weighting onto a 1 m
   grid (`raster_resolution_m` in `data/out/meta.json`) covering the study area, and the
   Liljegren model runs on that grid using clear sky global horizontal irradiance from
   `pvlib`'s Ineichen model, since the NREL NSRDB API, which would supply a measured
   irradiance product, requires a registered key that was not reachable in this
   environment.

3. **Shade (`pipeline/s3_shadow.py`).** A digital surface model is rasterised from OSM
   building footprints at 1 m resolution (783 buildings, `data/out/meta.json`,
   `sources[].n_buildings_rasterized`), using each building's OSM height tag where
   present, `building:levels` times 3.5 m per storey where only a level count is tagged,
   and a flat 3.5 m single storey default otherwise. A vectorised raymarch against that
   surface, driven by `pvlib`'s solar position for each kickoff hour, produces a boolean
   shade mask per grid cell per hour. This mask enters the WBGT calculation correctly:
   a shaded cell has its direct beam irradiance removed before the Liljegren solve, not a
   flat temperature offset subtracted afterward, so it still receives diffuse sky
   irradiance and shortwave reflected from adjacent sunlit ground, both physically
   modelled terms, while the model's known limitation, that pavement radiating longwave
   heat back at a pedestrian is not represented because the underlying library fixes
   surface temperature to air temperature internally, is recorded rather than hidden.

4. **Land surface temperature coupling and the exposure raster
   (`pipeline/lst_houston.py`, `pipeline/s4_surface.py`).** Ten cloud-screened Landsat
   Collection 2 Level 2 ST_B10 scenes from 2018 through 2024 (`data/out/meta.json`,
   `sources[].scenes`), pulled via the Microsoft Planetary Computer STAC API, are pooled
   and reprojected onto the same 1 m grid. The resulting land surface temperature anomaly
   is added to the interpolated station air temperature as
   `tair_cell = tair_station_interpolated + beta * (lst_cell - lst_area_mean)`, with
   `beta = 0.2` (Schwarz, N. et al. 2012, Ecological Indicators 18, 693-704), so that the
   spatial pattern of hotter and cooler surfaces the built environment actually produces
   is layered onto the absolute temperature level the ASOS stations already set. This is
   a defensible substitution, since the buildings and vegetation producing that pattern
   do not move, but it is also a genuine limitation: Landsat crosses Houston near 10:30 to
   11:00 local solar time, well before the 15:00 to 21:00 kickoff hours actually studied,
   so a late-morning spatial pattern is being used as a proxy for an afternoon and evening
   one, not a same-time observation of either quantity. Before this coupling was added,
   the WBGT raster varied by only about 0.02 to 0.03 C across the entire study area at any
   given hour, a spread driven almost entirely by interpolation between three distant
   stations rather than by any real within-site variation; after coupling, the same field
   spans roughly 1.6 to 1.8 C across the study area depending on hour
   (`data/out/meta.json`, `wbgt_spatial_range_by_hour_c`), which is the real signal this
   coupling step exists to recover.

5. **Routes and integration (`pipeline/s5_routes.py`).** Each of the four approaches is
   split into roughly 20 m segments (172 segments total, `data/out/meta.json`,
   `n_segments`), and WBGT and shade are sampled every 2 m along each segment and
   integrated into degree-minutes above the 28 C threshold at a 1.3 m/s walking speed.
   Every segment additionally carries `degmin_lo` and `degmin_hi`, the 5th and 95th
   percentiles of a 128-draw Monte Carlo over meteorological inputs; see
   `docs/validation.md` for exactly what is and is not propagated into that band. Fans per
   approach are computed as NRG Stadium's official seating capacity, 72,220
   (`data/out/meta.json`, `assumptions.nrg_capacity`), times a per-approach mode share.
   That mode share is a stated modelling assumption
   (`metrorail_stadium_park` 0.10, `lot_c` 0.45, `rideshare_kirby` 0.15, `fan_fest` 0.10,
   summing to 0.80 because a residual share is assumed to arrive by unmodelled means),
   not an observed survey; see the organiser data section below for why an
   evidence-based alternative was attempted and rejected.

6. **Shade budget allocation (`pipeline/s6_optimize.py`).** Three shading interventions,
   a shade sail, a street tree, and a bus stop awning, each with a sourced unit cost and a
   shaded-area specification in `pipeline/costs.yml`, are candidates for every segment
   they apply to. The optimizer is a cost-effectiveness greedy heuristic: at each step it
   buys whichever remaining (segment, intervention) pair removes the most degree-minutes
   per dollar, repeating across 81 budget levels from 0 to a $2,000,000 cap in $25,000
   steps (`pipeline/config.yml`, `optimizer`). It is explicitly a heuristic; ratio-greedy
   under a budget constraint, unlike greedy under a simple cardinality constraint, carries
   no formal approximation guarantee, and this project does not claim one. Two coverage
   horizons are computed from the same greedy logic: a near-term 2026 horizon, which
   credits a newly planted tree with only the canopy fraction it will actually have at
   year five rather than at full maturity, and a mature horizon, which is the same logic
   run against full mature canopy and represents long-run legacy value rather than what
   the tournament itself saw. The near-term horizon is the one presented as the honest
   number for the 2026 event.

7. **Eleven city ledger (`pipeline/s7_cities.py`).** A comparative screen ranks eleven
   World Cup host markets using a deliberately lighter method: real NLCD tree canopy and
   real pooled Landsat surface temperature inside a 2 mile buffer of each venue, combined
   into a transparent, non-physical proxy, `k * max(lst_p90_c - 32.0, 0) * (1 -
   canopy_pct/100) * 15 minutes`, with the constant `k` solved once so Houston's proxy
   value matches the fan-weighted mean degree-minutes per trip an actual run of the full
   Houston pipeline produced at the 15:00 kickoff hour. This ledger is explicitly not the
   raytraced, WBGT-based Houston model; it has no shading geometry and no wind, and its
   32 C scale anchor is the pipeline's extreme tier value
   (`pipeline/config.yml`, `walk.wbgt_extreme_c`), not the primary 28 C threshold used
   everywhere else in this narrative. It exists to give a defensible order-of-magnitude
   comparison across markets, not a second measurement of Houston.

8. **Organiser dataset stage (`pipeline/s9_organizer.py`).** Deliberately excluded from
   the default pipeline run because the underlying datasets are confidential to
   competition participants, this stage produces the two corroboration checks and one
   rejected derivation described below.

9. **Design-condition kickoff sweep (`pipeline/s10_kickoff.py`).** Sweeps the same
   physics across all ten modelled kickoff hours under generalized design conditions
   (each hour's own hottest candidate match date) to answer what a scheduling decision,
   not a capital expenditure, is worth in general. Appropriate to a forward-looking
   decision at a venue where kickoff time has not yet been set.

10. **Measured retrospective schedule analysis (`pipeline/s12_retrospective.py`).** Re-runs
    the meteorology fetch, urban heat island coupling and shade raymarch fresh for each of
    the seven NRG matches on that match's own actual date and kickoff hour, rather than a
    substituted or swept design condition, to measure what those seven scheduling
    decisions, already made, actually cost.

11. **Equity join (`pipeline/s11_vulnerability.py`).** Joins CDC/ATSDR Social
    Vulnerability Index (2022 vintage, `RPL_THEMES` field) and NLCD 2021 tree canopy onto
    each of the 172 segments by midpoint, and checks whether the SVI-blind cost
    effectiveness optimizer happens to fund higher- or lower-vulnerability ground.

12. **Provenance (`pipeline/meta.py`, `pipeline/gen_provenance.py`).** Generates
    `data/out/meta.json` and `docs/provenance.csv` directly from the pipeline's own
    configuration and run artefacts, so neither can silently drift from what the code
    actually did.

## Results, with uncertainty on every headline number

Across the four approaches, 172 segments carry a total walked distance whose traversal
time, at 1.3 m/s, works out to about 11,667 person-hours of walking for the full modelled
fan population of 57,776 (`data/out/segments.geojson`, summing `len_m` by approach and
dividing by 1.3 m/s and 3600, multiplied by each approach's `fans` field; this quantity is
a function of geometry and the mode-share assumption, not of weather, and is constant
across kickoff hours).

At the 15:00 baseline kickoff hour, those fans accumulate **72,123 fan-degree-hours**
above the 28 C WBGT threshold on the last mile to NRG Stadium
(`data/out/kickoff_clock.json`, `hours.15.fan_hours_above_threshold`). Substituting each
segment's `degmin_lo` and `degmin_hi` for `degmin` in that same fans-weighted sum gives an
honest band of roughly **50,000 to 93,000 fan-degree-hours** around that central figure,
recomputable directly from `data/out/segments.geojson`. The hottest of the ten modelled
hours is 14:00, at 88,378 fan-degree-hours (band roughly 64,000 to 102,000); the coolest
modelled hours, 20:00 and 21:00, both reach 0.

A shade budget targeted at the 15:00 baseline shows steep early returns. At $25,000 spent
($24,900 actually committed, 83 segment-intervention pairs funded, almost entirely $300
street trees), the optimizer averts 3,540,003 degree-minutes summed across all ten
modelled hours, at a marginal cost of $0.007 per degree-minute averted
(`data/out/solutions.json`, `path."25000"`). At $50,000 spent, 166 pairs are funded and
4,543,771 degree-minutes are averted at $0.011 per degree-minute. At the full $2,000,000
cap ($1,989,100 actually spent, 297 pairs funded), 16,436,667 degree-minutes are averted
at $0.121 per degree-minute, and the two most exposed approaches, Lot C and the Kirby
Drive rideshare zone, together representing 43,332 of the 57,776 modelled fans, no longer
have any segment whose peak WBGT crosses the 32 C extreme tier at all
(`data/out/solutions.json`, `path."2000000"`, `fans_clear_of_extreme`). These optimizer
figures use each hour's central meteorological estimate and do not themselves carry a
Monte Carlo band; that is a limitation of the optimizer stage relative to the segment-level
exposure figures above, and it is stated here rather than implied away.

## The schedule analysis, read retrospectively

The 2026 World Cup matches at NRG have already been played, on their own dates, under
their own observed weather. The most rigorous account of what that cost is
`data/out/retrospective.json`, which does not sweep a generalized design-condition hour or
substitute the hottest of several candidate dates the way the broader sweep described
below does; it fetches each match's own actual ASOS observations at KHOU, KIAH and KSGR
for that match's own date and kickoff hour, couples them to the same Landsat urban heat
island field used everywhere else in this project, rebakes the pedestrian shade mask for
that match's own true solar geometry, and walks the same four approaches. Its own method
note is explicit that the alternative, hour-sweep approach is "a design condition choice
appropriate to forecasting, not to measuring a past event," which is exactly why this
measured, per-match file is the primary source for this section rather than a secondary
one.

Of the seven Houston matches, six kicked off at 12:00 local time and one, on 26 June 2026,
kicked off at 19:00 (`pipeline/config.yml`, `fixtures.matches`). Measured from each
match's own observed weather, the seven matches accumulated **297,665 fan-degree-hours**
above the 28 C WBGT threshold on the last mile to NRG Stadium across the tournament
(`data/out/retrospective.json`, `tournament_total.tournament_total_fan_degree_hours_above_threshold`),
ranging match to match from 20,066 fan-degree-hours (20 June) to 87,061 (4 July), with the
one evening kickoff, 26 June, at 0 (`data/out/retrospective.json`, `matches[].fan_degree_hours_above_threshold`).
This measured total differs from a naive same-hour design-condition estimate, and that
difference is itself informative: it shows how much day-to-day weather variation matters
even at a fixed kickoff hour, which a generalized sweep by construction cannot show.

`data/out/retrospective.json` also runs a matched counterfactual: for each of the six noon
matches, it recomputes that same date's exposure at 19:00 instead, the hour the one
already-evening match actually used, holding that date's own observed weather fixed and
changing only the clock hour and the resulting sun geometry and shade. Across the six noon
matches, this counterfactual removes 261,784 of the 297,665 tournament-wide fan-degree-hours,
**91.7 percent**, at zero capital cost, purely from moving kickoff to an hour NRG had
already used once during this same tournament
(`data/out/retrospective.json`, `counterfactual_evening_kickoff.totals`). This is not a
forecast or a recommendation to reschedule matches that have already been played; it is a
measurement of what six noon kickoffs actually cost in pedestrian heat exposure, holding
real observed weather fixed, and it excludes any second-order effect a genuine schedule
change might have had on attendance or arrival patterns, a limitation the file states
directly.

A broader, complementary view comes from `data/out/kickoff_clock.json`, which sweeps all
ten modelled hours (12:00 through 21:00) under generalized design conditions (each hour's
single hottest candidate match date, not a specific match's own weather) rather than the
seven actually-played dates. That sweep is explicit that it is "appropriate to
forecasting, not to measuring a past event," and is the tool this project actually
recommends for a venue where the kickoff decision has not yet been made: at the 15:00
design condition it finds 72,123 fan-degree-hours (band roughly 50,000 to 93,000, derived
above), falling to 0 at 20:00 and 21:00 and peaking at 88,378 at 14:00 (band roughly
64,000 to 102,000). Both files agree on the same underlying conclusion by different, and
appropriately different, methods: for this walk, in this climate, kickoff hour is worth
an order of magnitude more than any capital shade spend modelled in this project, and it
costs nothing to choose.

## The equity analysis, and its real limitation

`data/out/equity.json` joins the CDC/ATSDR Social Vulnerability Index (2022, `RPL_THEMES`)
and NLCD 2021 tree canopy onto the 172 walk segments by midpoint. The single most
important limitation of this analysis is stated plainly in that file and repeated here:
of 16 census tracts returned for the study area's bounding box, only **3 distinct tracts**
actually contain a segment midpoint (`data/out/equity.json`,
`svi_source.join_diagnostics.n_tracts_matched_to_a_segment`). A segment-level correlation
between exposure and SVI across all 172 segments (Pearson r = 0.207, p = 0.0065; Spearman
r = 0.254, p = 0.0008) looks statistically confident, but it pseudo-replicates: every
segment inside the same tract shares one identical SVI value, so the true independent
sample size is 3, not 172. Collapsed honestly to the tract level, the same relationship is
Pearson r = 0.50 on n = 3, p = 0.667, not distinguishable from no relationship at all
(`data/out/equity.json`, `correlation_exposure_vs_svi_tract_level`). Neither version
should be read as a finding about heat and social vulnerability in Houston generally; the
study area is one stadium's four approach corridors, which is simply too small a sample
of tracts to say anything general.

What can be said with more confidence is about the optimizer's behaviour, not about the
underlying geography: the shade budget optimizer contains no SVI term anywhere in its
objective, yet at the full $2,000,000 cap the dollar-weighted mean SVI of the funded set
is 0.4538, above the simple mean SVI of 0.4075 across all 172 segments
(`data/out/equity.json`, `optimizer_equity.dollar_weighted_mean_svi_at_full_cap` and
`baseline_mean_svi_all_172_segments`). A purely cost-effectiveness-driven allocation
happens to be mildly progressive here, meaning it directs a disproportionate share of
spend toward higher-vulnerability segments, but only as a byproduct of where those
segments are cheap to treat, not because vulnerability was ever an input.

`data/out/equity.json` also documents, explicitly as an illustrative scaling rather than a
measurement, that stadium staff and gig workers who walk an approach corridor repeatedly
across a season are invisible to every other number in this pipeline, which is built
around a single ticketed fan's one-way trip. No worker schedule, wage, or home-address
data exists anywhere in this repository, and this gap is not resolved here, only named.

## What the organisers' datasets showed, and why one was rejected

Two checks were run against the hackathon organisers' sample datasets, and one derivation
was attempted and abandoned. Both the datasets themselves and the results are treated with
the same discipline: the organisers disclose that their sample data carries added noise
and jittered coordinates and should not be used to make assessments of any real city or
venue, and every figure that touches organiser data in this project is used only for
corroboration or as an evidence-based weighting attempt, never as a measurement of real
Houston conditions.

**The urban heat index corroboration was too weak to conclude anything.** Of 80,959
organiser heat index points inside the Houston market, 210 fall inside this project's
study bounding box (`data/out/uhi_validation.json`, `n_houston_market_points`,
`n_points_inside_study_bbox`). Rank correlation between the organisers' coarse 1-to-11
ordinal heat index and this pipeline's own Landsat-derived heat anomaly at those points is
Spearman r = 0.147, Pearson r = 0.193. Given the small sample confined to a small study
area, the organisers' disclosed additive noise, and the coarseness of an 11-point ordinal
scale, this test simply lacks the statistical power to corroborate or contradict the
Landsat field in either direction, and it is not presented here as support for it.

**The derived fan volumes failed a plausibility gate and were rejected.** An attempt was
made to replace the invented approach mode shares with shares estimated from the
organisers' point-of-interest and store-visit sample data
(`data/out/fan_volumes.json`). The resulting derived share for the fan fest approach
disagreed with the original invented prior by a factor of 6.29, and the method carries a
disclosed structural blind spot: a stadium surface parking lot such as Lot C contains
almost no commercial points of interest of its own by definition, so a point-of-interest
density proxy cannot see genuine gameday parking-lot foot traffic through it at all,
whatever that traffic actually is. Rather than accept a sixfold disagreement or quietly
average it away, the pipeline's own plausibility gate rejected the derivation and fell
back to the original invented mode share constants
(`data/out/meta.json`, `assumptions.mode_share_source:
invented_fallback_implausible_organizer_data`). This is disclosed as a rejection, not
smoothed into an unearned improvement: it would have been easy to present the
organiser-derived shares as an evidence-based upgrade, and they were not used because the
evidence did not hold up under a symmetric test that was written before the derivation was
run.

## Assumptions and limitations, stated completely

- **Validation covers the spatial interpolation of station observations, not the
  Liljegren WBGT model itself.** No instrumented WBGT record exists for this site and
  these dates. See `docs/validation.md` for the full account, including the leave-one-out
  cross validation result of RMSE 1.05 C, bias 0.03 C, n = 30 (`data/out/meta.json`,
  `validation`).
- **Building heights come from OpenStreetMap tags, not LiDAR.** Missing or under-tagged
  buildings cast less shadow than they should, which biases modelled exposure high
  specifically where OSM coverage is weak; there is no equivalent mechanism that would
  bias exposure low.
- **Solar irradiance is a clear-sky physical ceiling from `pvlib`, not a measured
  NSRDB product**, because the NSRDB API requires a key not available in this
  environment. Real cloud cover only ever reduces irradiance below this ceiling, so this
  substitution biases modelled exposure high on any day with cloud cover and is exact only
  on an actually clear day.
- **The land surface temperature spatial pattern is sampled at a late morning satellite
  overpass and applied to afternoon and evening hours.** The direction of the resulting
  bias, if the true afternoon spatial contrast differs from the late-morning one, is not
  known and is not claimed to be known.
- **Approach mode share (10 percent METRORail, 45 percent Lot C, 15 percent rideshare, 10
  percent Fan Fest) is a stated modelling assumption**, not an observed survey, after an
  evidence-based alternative was attempted and rejected for cause; see above.
- **Stadium gates are eight evenly spaced perimeter points**, because the OSM
  `building=stadium` way for NRG carries no tagged entrance nodes.
- **Walking path width (2.0 m) used to convert an intervention's shaded area into a
  segment coverage fraction is an assumption, not a measurement.**
- **The reported Monte Carlo uncertainty band on every segment is a lower bound on total
  uncertainty, not a full propagation.** The 150 mm globe diameter, the 0.2 UHI coupling
  coefficient, the shade mask geometry itself, the sky diffuse fraction, ground albedo,
  walking speed, mode share and the 28 C threshold are all held fixed; the pipeline's own
  metadata states that varying the globe diameter alone would move the headline number by
  more than the entire reported band.
- **The shade budget optimizer is a heuristic with no formal approximation guarantee**,
  and its per-hour conditions are point estimates, not Monte Carlo draws, so its
  degree-minute figures do not themselves carry an uncertainty interval the way segment
  exposure figures do.
- **One of six intervention unit costs, the misting station, is an unsourced order-of-
  magnitude estimate.** No public unit cost for a municipal right-of-way misting
  installation was located; see `docs/provenance.csv` and `pipeline/costs.yml` for the
  residential-system price range used as a starting point and the reasons it likely
  understates a public installation's true cost.
- **The equity analysis draws on only 3 independent census tracts** and should not be
  generalised beyond this one stadium's four approach corridors.
- **Repeat-exposure populations, stadium staff, vendors, security, are not modelled at
  all.** Every figure in this project describes a single ticketed fan's one-way trip.
- **The eleven-city ledger is a lighter, non-physical proxy**, not a second application of
  the raytraced Houston model, and its match counts per city are typed from general
  knowledge, not fetched from a live schedule source, and are flagged as such in
  `data/out/cities_method.json`.

## What a city or venue operator should do with this

For NRG Stadium specifically, the retrospective finding is unambiguous and already
actionable at other venues facing the same choice: a noon kickoff in Houston summer
imposes an order of magnitude more pedestrian heat exposure on the last mile than an
evening kickoff at 19:00 or 20:00 does, at zero infrastructure cost either way, because it
is a scheduling decision rather than a capital one. Where kickoff time cannot move, the
ranked segment
list in `data/out/solutions.json` says specifically where a limited shade budget removes
the most exposure per dollar, starting with the cheapest, most cost-effective
intervention, street trees at $300 each, before moving to sails and awnings as the budget
grows.

The method itself, not just the Houston result, is what transfers. The same pipeline,
run against a venue's own OSM pedestrian geometry, ASOS-equivalent meteorology and Landsat
coverage, produces the same kind of ranked, dollar-priced, uncertainty-bounded segment
list for any stadium approach anywhere. The eleven-city ledger's lighter proxy metric
already shows this is not a Houston-specific problem: SoFi Stadium, the venue for the
2028 Los Angeles Olympics, ranks second of the eleven modelled World Cup host markets on
that proxy, at 73.6 degree-minutes per trip against Houston's calibration anchor of 77.4
(`data/out/cities.json`), behind only Houston itself. Los Angeles is exactly the kind of
venue where the kickoff or start-time decision this project quantifies for Houston
retrospectively is, for LA 2028, still open. Running the full method there, rather than
the lighter ledger proxy used here, is the direct next step for a venue operator who wants
this same ranked, dollar-priced answer before the decision is made rather than after.
