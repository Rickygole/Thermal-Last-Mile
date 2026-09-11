# Pitch and submission copy

Retrospective note: NRG Stadium's seven 2026 World Cup matches were played between 14 June and 4 July 2026. Everything below describes exposure that already happened, measured after the fact, not a forecast and not a request to move a schedule that no longer exists to move. The Los Angeles material is a forward looking method transfer, not a recommendation about a decision that is still open there.

---

## 1. Ninety second pitch script

Spoken over a screen recording of the live application. The presenter drives; nobody clicks aimlessly. No music, no logo, no team introduction. Every second is evidence.

**0:00 to 0:12, screen: The Walk**
On screen: the looping fan-walk animation, coloured heat surface, the stat card reading "One fan, one walk, N degree-minutes above WBGT 28C."
Say: "NRG Stadium has a retractable roof and full air conditioning. The stadium was cooled. This walk, from the rail platform, the parking lots, and the rideshare zone to the gates, was not, and nobody had measured it until now."

**0:12 to 0:32, screen: the kickoff clock (Clock)**
On screen: the ten-hour kickoff sweep table, the headline sentence comparing the 15:00 baseline to the best hour, the fixture list showing the actual match dates.
Say: "These seven matches already happened, June 14th through July 4th. Six kicked off at noon, one at 7 PM. Running the same physics against that real schedule gives 297,665 fan degree-hours above WBGT 28 accumulated on the walk in, across the tournament. Sweeping all ten plausible kickoff hours shows an 8 PM kickoff would have produced zero, at zero capital cost."

**0:32 to 0:48, screen: The Map**
On screen: the ranked segment list, the deck.gl exposure map, the budget bar for the greedy optimizer.
Say: "The map ranks all 172 walk segments by exposure and prices fixes against each one: a street tree at $300, a shade sail at $15,500, a bus shelter at $18,700, each scored by cost per degree-minute averted. It's a spend list a public works department could actually use, not just a heat map."

**0:48 to 1:04, screen: The Ledger**
On screen: the eleven host-city table, sparkbars, Houston at the top with LA and Dallas close behind.
Say: "Zoom out to all eleven U.S. host cities and Houston tops the table, with LA within about 5 percent of it and Dallas within about 8 percent. But this ledger is a deliberately lighter proxy, canopy and surface temperature only, no route, no shade modelling. It's here to be honest about what a quick city-level number can and can't tell you."

**1:04 to 1:22, screen: The Transfer**
On screen: the split view, Houston fully rendered on one side, Los Angeles 2028 left visibly blank and labelled "illustrative only, nothing measured here."
Say: "That's the method transfer test. Houston's side is fully modelled end to end. LA's side is left blank on purpose, because no walk there has been segmented or measured yet. The pipeline itself, station weather, satellite heat, building shade, segment-by-segment routing, is what a host city could run before it sets a kickoff time, not after."

**1:22 to 1:30, close on The Transfer**
Say: "The walk from the platform to the gate is the one part of a mega event nobody owns. We measured it, for a tournament that already happened, and found the schedule mattered more than anything we could have built."

---

## 2. The one sentence

For the seven Houston World Cup matches that already took place, this project applied a published wet bulb globe temperature model to observed weather along the actual pedestrian route from platform and parking lot to a roofed, air-conditioned NRG Stadium, and found that kickoff hour, not shade infrastructure, was the largest lever over fan heat exposure, a retrospective measurement whose method, not whose specific schedule, is what transfers forward to venues like Los Angeles 2028 where the kickoff decision is still open.

---

## 3. Devpost submission copy

**Tagline**

We measured the heat a fan absorbed walking to NRG Stadium across seven Houston World Cup matches, in and out. Six kicked off at noon. That choice carried 69 percent.

**What it does**

This project measures pedestrian heat exposure on the last mile to NRG Stadium, from the METRORail platform, NRG Lot C, the Kirby Drive rideshare zone, and the Fan Fest site, to the stadium gates, for the seven 2026 World Cup matches Houston hosted. Exposure is degree-minutes of wet bulb globe temperature above 28C, integrated along the walked path, using the Liljegren WBGT model against real hourly weather observations from three Houston-area ASOS stations, coupled to a Landsat land surface temperature field for spatial variation and to OpenStreetMap building footprints for shade. It ranks all 172 walking segments by exposure, prices five interventions (trees, sails, awnings, misting, cool pavement) against a cost-per-degree-minute optimizer, and runs a ten-hour kickoff sweep to show what the same physics would have produced at every plausible kickoff time. Against the actual schedule (six matches at noon, one at 19:00), the seven matches accumulated 297,665 fan degree-hours above threshold on the walk in; the sweep shows an 8 PM kickoff would have produced zero. A lighter eleven-city proxy ledger and a Los Angeles 2028 method-transfer screen extend the question past Houston without pretending to have measured anything they haven't.

**How it was built**

Hourly air temperature, humidity, wind, and pressure come from the Iowa Environmental Mesonet ASOS archive for KHOU, KIAH, and KSGR, inverse-distance-weighted onto a 1 metre grid. Wet bulb globe temperature is computed with pywbgt's implementation of Liljegren et al. (2008). A spatial urban heat island pattern comes from ten cloud-screened Landsat 8/9 Collection 2 surface temperature scenes (2020 to 2024), applied as an anomaly on top of the station-observed absolute temperature for each kickoff hour, since Landsat's morning overpass cannot observe afternoon or evening conditions directly. Building shade comes from OpenStreetMap footprints rasterized with height tags or storey counts. Solar irradiance is pvlib's clear-sky model, substituted for NREL NSRDB, which required a key this environment could not reach. Walking segments (172 of them, nominal 20 m each) were cut along the four approach corridors and scored against a greedy cost-effectiveness optimizer that allocates a capped budget across five priced interventions. A kickoff-hour sweep reruns the same WBGT and routing logic across ten candidate hours and, separately, binds the actual seven-match Houston schedule to it. Social vulnerability (CDC/ATSDR SVI 2022, RPL_THEMES) and tree canopy (NLCD 2021) are joined per segment for an equity pass. An eleven-city ledger and a Los Angeles 2028 transfer screen apply a lighter canopy-and-surface-temperature proxy to test whether the method generalizes.

**What we learned**

The biggest number in this project isn't a shade structure, it's an hour. Moving the modelled kickoff from the 15:00 baseline used for pricing to 20:00 removes 100 percent of the exposure above threshold in the generalized ten-hour design-condition sweep, for zero dollars, because it's a scheduling decision rather than a capital one (`data/out/kickoff_clock.json`, `summary`). That is the sweep's result, not the measured tournament figure: holding each date's own observed weather fixed and moving only the six noon matches to the one evening hour NRG already used once, the measured retrospective shows a 91.9 percent reduction, not 100 percent (`data/out/retrospective.json`, `counterfactual_evening_kickoff`). Both numbers are threshold-conditional, not an absolute removal of heat: "the reported reduction depends on the threshold. drawn at a lower reference temperature the same schedule change removes a smaller share, because more of the day's load is counted. the 28 C action limit used here sits on a steep part of that curve, so this figure should be read as threshold conditional rather than as an absolute removal of heat exposure" (`data/out/kickoff_clock.json`, `summary.threshold_sensitivity_note`). Every other finding in this project is smaller than the schedule effect, at either number. We also learned where our own pipeline is thin: an evidence-based attempt to derive fan approach volumes from POI and visitation data was built, tested against a plausibility gate, and rejected, because a parking-lot approach structurally has almost no points of interest to count even though it carries the most fans. Tree canopy pricing depends heavily on which growth horizon you credit it against; the same $25,000 of trees remove more than twice as much exposure once mature as they do at the year-five canopy fraction the 2026 tournament would actually have seen. And an equity read against social vulnerability is real but thin, three census tracts is not a sample size that supports a general claim, and we report the honest (not significant) tract-level number next to the flattering but pseudo-replicated segment-level one.

**What's next**

Bind fan approach volumes to a real survey or turnstile count rather than an invented split. Extract and segment a real Los Angeles 2028 corridor so the Transfer screen has two measured sides instead of one measured and one deliberately blank. Widen the equity study area enough to get past three census tracts. If a WBGT instrument record ever exists for this site, validate the heat model itself rather than only the station-interpolation layer beneath it.

---

## 4. Five hardest questions

**"Your approach mode shares, rail, parking, rideshare, Fan Fest, aren't those just made up?"**

Yes, and we say so directly in the output rather than hiding it. We built an evidence-based derivation from the organizers' point-of-interest and visitation data, and it disagreed with our prior by more than six times on one approach. The reason is structural, not a modelling bug: NRG Lot C is a surface parking lot, so a POI-density method structurally undercounts exactly the approach that actually carries the most fans on gameday, while an approach bordering ordinary retail gets structurally overcounted. We built a plausibility gate that catches disagreement in either direction and fires here, so the pipeline falls back to a stated, labelled assumption (rail 10 percent, Lot C 45 percent, rideshare 15 percent, Fan Fest 10 percent) instead of publishing a number we already knew was wrong. It is an assumption, flagged as one everywhere it's used, not a measurement.

**"How do you actually know your heat numbers are right?"**

Partially, and we're specific about which part. We ran leave-one-out cross-validation on the station interpolation feeding the model: predicting each of the three ASOS stations from the other two gives 1.05C RMSE and 0.03C bias across 30 samples on the ten-hour design-condition sweep. On the seven real match hours that actually produce the tournament headline, the same check gives a larger and more honest number, 1.55C RMSE, 0.06C bias, largest single error 3.89C, across 21 samples, and that is the figure that should be read against the headline rather than the smaller sweep figure. That validates the spatial interpolation of observed air temperature, not the WBGT model itself, since no wet bulb globe temperature instrument exists at this site for these dates. We also ran the one independent check available to us, the organizers' own sample urban heat index data, against our Landsat-derived heat pattern, and it showed only weak rank agreement (Spearman 0.147, Pearson 0.193 across 210 points). Given the organizers' disclosed noise injection and their coarse 1-to-11 scale, we report that as neither corroborating nor contradicting our field, not as support for it. What we can defend is the physics chain itself (a published WBGT implementation against real station weather) and the interpolation step underneath it; what we can't yet defend is an independent, same-time, same-place measurement of WBGT or of the satellite heat pattern.

**"Doesn't your tree pricing overstate what trees do for the tournament that already happened?"**

It would, if we only showed one curve, so we show two. At $25,000 of tree spending, the year-five 2026 canopy credit removes 3.71 million degree-minutes of exposure; the identical trees at full maturity remove 8.19 million, more than double. If someone quoted the mature number as what 2026 fans experienced, that would be wrong, and we label the near-term curve as the honest one for the tournament and the mature curve as the long-term legacy value of the same spend. Separately, even at unlimited tree-only spend, our tree-only ceiling model tops out removing about 17 percent of the 15:00 baseline's fan degree-hours (12,887 of 75,476), which is one more reason the schedule finding, not the tree-planting finding, is the headline result.

**"Your equity analysis rests on three census tracts, isn't that meaningless?"**

Mostly, and we report it that way rather than the flattering version. At the segment level (n=172) the exposure-to-social-vulnerability correlation looks significant (Pearson r=0.20, p=0.0087), but that's pseudo-replication, every segment inside one census tract shares an identical SVI value, so the true independent sample is the number of distinct tracts, three. At that honest sample size the relationship is not testable at all. A Pearson correlation on three points has one degree of freedom and its sampling distribution is close to uniform on minus one to one, so we do not report a tract level coefficient as meaningful. The correct statement is that this design cannot test the question. We publish both numbers side by side specifically so the flattering one can't be quoted alone. What we can defend at this scale is narrower: the optimizer, which has no social-vulnerability term anywhere in its objective, spends noticeably more per dollar on higher-vulnerability ground once you weight by cost rather than just by segment count (dollar-weighted mean SVI 0.662 versus a baseline mean of 0.4075 across all segments), which is a real observation about this specific optimizer's behaviour on this specific corridor, not a general claim about heat and vulnerability in Houston.

**"Is your eleven-city ledger claiming Houston is the worst World Cup host city for heat?"**

No, and the Ledger screen exists specifically to head that reading off. That table uses a much lighter proxy than the Houston model: canopy percentage and Landsat surface temperature inside a fixed radius around each venue, with one flat nominal trip duration applied identically to all eleven cities, no wet bulb globe temperature, no ray-traced building shade, no actual walking route or segment geometry. Houston does rank first on that proxy, with LA within about 5 percent of it and Dallas within about 8.3 percent, but that's a city-level scatterplot finding, not a route-level one. We built it to show a null result on purpose: whole-city canopy percentage does not predict what one fan actually carries on one specific walk, which is the argument for building the segment-level Houston model in the first place instead of trusting a radius-and-canopy shortcut.

---

## Numbers used above, and where each comes from

- 28C WBGT threshold, 172 segments, 1 m raster, 20 m nominal segment length: `data/out/meta.json`
- 297,665 fan degree-hours measured across the seven matches actually played, six at 12:00 and one at 19:00 on 2026-06-26: `data/out/retrospective.json` (`tournament_total.tournament_total_fan_degree_hours_above_threshold`), not `kickoff_clock.json`, which has no `as_scheduled` key
- The 100 percent removal achievable by an 8 PM kickoff at zero cost in the generalized design-condition sweep, and its threshold-sensitivity caveat: `data/out/kickoff_clock.json` (`summary`, `summary.threshold_sensitivity_note`); the measured tournament figure for the same move is 91.9 percent, not 100: `data/out/retrospective.json` (`counterfactual_evening_kickoff.totals`)
- Tree-only ceiling of 12,887 fan-hours removable against a 75,476 fan-hour 15:00 baseline: `data/out/kickoff_clock.json` (`summary.tree_only_ceiling_at_1500`, `hours.15.fan_hours_above_threshold`)
- Intervention unit costs (tree $300, sail $15,500, awning $18,700, misting $6,500, cool pavement $10.65/m2): `data/out/meta.json` (`costs`)
- $25,000 tree spend removing 3.71 million degree-minutes near-term versus 8.19 million at maturity: `data/out/solutions.json` (`path` and `path_mature`, budget step 25000)
- Station interpolation validation: 1.05C RMSE, 0.03C bias, n=3 stations, n=30 samples on the hour sweep (`data/out/meta.json`, `validation`); 1.55C RMSE, 0.06C bias, n=21, on the seven real match hours that produce the headline (`data/out/retrospective.json`, `match_hour_validation`), the larger and more relevant of the two
- Organizer heat index corroboration, Spearman 0.147, Pearson 0.193, n=210: `data/out/uhi_validation.json`
- Fan volume derivation rejected, 6.29x disagreement on the Fan Fest approach: `data/out/fan_volumes.json`
- SVI correlation, segment level r=0.1996/p=0.0087 (n=172), reported only to show it is pseudo replicated across three distinct tract values, and dollar-weighted mean SVI 0.662 versus baseline 0.4075: `data/out/equity.json`
- Eleven-city ledger, Houston 77.4 degree-minutes per trip versus LA 73.6 (about 5 percent lower) and Dallas 71.0 (about 8.3 percent lower): `data/out/cities.json`
