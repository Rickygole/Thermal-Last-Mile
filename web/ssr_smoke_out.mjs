import { jsxs, jsx, Fragment } from "react/jsx-runtime";
import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { useMemo } from "react";
import { create } from "zustand";
function EmptyState({ title, body, hint }) {
  return /* @__PURE__ */ jsxs("div", { className: "empty", role: "status", children: [
    /* @__PURE__ */ jsx("h3", { children: title }),
    body ? /* @__PURE__ */ jsx("p", { children: body }) : null,
    hint ? /* @__PURE__ */ jsx("code", { children: hint }) : null
  ] });
}
const EXPOSURE = {
  low: [151, 196, 89],
  moderate: [239, 159, 39],
  severe: [226, 75, 74]
};
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
function exposureColor(t) {
  const c = Math.max(0, Math.min(1, t));
  if (c < 0.5) return mix(EXPOSURE.low, EXPOSURE.moderate, c / 0.5);
  return mix(EXPOSURE.moderate, EXPOSURE.severe, (c - 0.5) / 0.5);
}
const rgbCss = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
const exposureCss = (t) => rgbCss(exposureColor(t));
const n0 = (v) => Number.isFinite(v) ? Math.round(v).toLocaleString("en-US") : "--";
const n1 = (v) => Number.isFinite(v) ? v.toFixed(1) : "--";
const n2 = (v) => Number.isFinite(v) ? v.toFixed(2) : "--";
function usd(v) {
  if (!Number.isFinite(v)) return "--";
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${Math.round(v / 1e3)}k`;
  return `$${Math.round(v)}`;
}
const tempC = (v) => Number.isFinite(v) ? `${v} C` : "a threshold meta.json does not state";
const W = 560;
const H = 300;
const L = 46;
const R = 16;
const T = 16;
const B = 40;
function fit(points) {
  const n = points.length;
  if (n < 3) return null;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of points) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r: sxy / Math.sqrt(sxx * syy) };
}
function CityScatter({ cities: cities2, focus }) {
  const model = useMemo(() => {
    const points = cities2.filter((c) => Number.isFinite(c.canopy_pct) && Number.isFinite(c.degmin_per_trip)).map((c) => ({ x: c.canopy_pct, y: c.degmin_per_trip, city: c }));
    if (!points.length) return null;
    const maxX = Math.max(...points.map((p) => p.x)) * 1.12;
    const maxY = Math.max(...points.map((p) => p.y)) * 1.12;
    const maxMatches = Math.max(...points.map((p) => p.city.matches || 1));
    return { points, maxX, maxY, maxMatches, line: fit(points) };
  }, [cities2]);
  if (!model) return null;
  const px = (v) => L + v / model.maxX * (W - L - R);
  const py = (v) => H - B - v / model.maxY * (H - T - B);
  return /* @__PURE__ */ jsxs("section", { className: "panel pane scatter", "aria-label": "Canopy against trip exposure across host cities", children: [
    /* @__PURE__ */ jsxs("div", { className: "pane-head", children: [
      /* @__PURE__ */ jsx("h3", { children: "Canopy against exposure, all host cities" }),
      /* @__PURE__ */ jsx("span", { className: "label", children: "circle area is matches hosted" })
    ] }),
    /* @__PURE__ */ jsxs("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Scatter of tree canopy percent against degree-minutes per trip for ${model.points.length} host cities`, children: [
      /* @__PURE__ */ jsx("line", { x1: L, x2: W - R, y1: H - B, y2: H - B, stroke: "#2E353E", strokeWidth: "0.5" }),
      /* @__PURE__ */ jsx("line", { x1: L, x2: L, y1: T, y2: H - B, stroke: "#2E353E", strokeWidth: "0.5" }),
      [0, 0.25, 0.5, 0.75, 1].map((t) => /* @__PURE__ */ jsxs("g", { children: [
        /* @__PURE__ */ jsx("line", { x1: L, x2: W - R, y1: py(model.maxY * t), y2: py(model.maxY * t), stroke: "#22262E", strokeWidth: "0.5" }),
        /* @__PURE__ */ jsx("text", { x: L - 8, y: py(model.maxY * t) + 3, fontSize: "10", fill: "#8B929B", textAnchor: "end", fontFamily: "inherit", children: n1(model.maxY * t) })
      ] }, t)),
      [0, 0.25, 0.5, 0.75, 1].map((t) => /* @__PURE__ */ jsx("text", { x: px(model.maxX * t), y: H - B + 15, fontSize: "10", fill: "#8B929B", textAnchor: "middle", fontFamily: "inherit", children: Math.round(model.maxX * t) }, t)),
      model.line ? /* @__PURE__ */ jsx(
        "line",
        {
          x1: px(0),
          y1: py(Math.max(0, model.line.intercept)),
          x2: px(model.maxX),
          y2: py(Math.max(0, model.line.intercept + model.line.slope * model.maxX)),
          stroke: "#4A525E",
          strokeWidth: "1",
          strokeDasharray: "4 4"
        }
      ) : null,
      model.points.slice().sort((a, b) => py(a.y) - py(b.y)).map((p, i, all) => {
        const r = 4 + 5 * Math.sqrt((p.city.matches || 1) / model.maxMatches);
        const isFocus = p.city.id === focus;
        const prev = i > 0 ? all[i - 1] : null;
        const crowded = prev && Math.abs(py(prev.y) - py(p.y)) < 13 && Math.abs(px(prev.x) - px(p.x)) < 90;
        const dy = crowded ? 12 : 3;
        return /* @__PURE__ */ jsxs("g", { children: [
          /* @__PURE__ */ jsx(
            "circle",
            {
              cx: px(p.x),
              cy: py(p.y),
              r,
              fill: exposureCss(p.y / model.maxY),
              fillOpacity: isFocus ? 1 : 0.75,
              stroke: isFocus ? "var(--accent)" : "#15171B",
              strokeWidth: isFocus ? 2 : 1
            }
          ),
          /* @__PURE__ */ jsx(
            "text",
            {
              x: px(p.x) + r + 5,
              y: py(p.y) + dy,
              fontSize: "10",
              fill: isFocus ? "#E7E9EC" : "#8B929B",
              fontFamily: "inherit",
              children: p.city.name
            }
          )
        ] }, p.city.id);
      }),
      /* @__PURE__ */ jsx("text", { x: L, y: H - 6, fontSize: "10", fill: "#8B929B", fontFamily: "inherit", children: "tree canopy percent" }),
      /* @__PURE__ */ jsx("text", { x: W - R, y: H - 6, fontSize: "10", fill: "#8B929B", textAnchor: "end", fontFamily: "inherit", children: "degree-minutes per trip on the vertical" })
    ] }),
    /* @__PURE__ */ jsx("p", { className: "label", children: model.line ? `Least squares fit across ${model.points.length} cities, slope ${n2(model.line.slope)} degmin per canopy point, correlation r ${n2(model.line.r)}. Descriptive only, canopy is not the only difference between these cities.` : "Too few cities to fit a trend." })
  ] });
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
function methodCounts(citiesMethod) {
  const cities2 = citiesMethod && citiesMethod.cities ? Object.values(citiesMethod.cities) : [];
  const fields = /* @__PURE__ */ new Map();
  for (const city of cities2) {
    for (const [key, value] of Object.entries(city)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      if (!("is_proxy" in value)) continue;
      const row = fields.get(key) || { field: key, measured: 0, proxy: 0, unstated: 0 };
      if (value.is_proxy === true) row.proxy += 1;
      else if (value.is_proxy === false) row.measured += 1;
      else row.unstated += 1;
      fields.set(key, row);
    }
  }
  return { total: cities2.length, fields: [...fields.values()] };
}
function houstonState(data2) {
  const meta2 = data2.meta;
  if (!meta2 || !Array.isArray(meta2.sources) || !meta2.sources.length) {
    return {
      tone: "unverified",
      label: "PROVENANCE UNSTATED",
      detail: "meta.json lists no input products, so nothing on this screen can be traced back to a source."
    };
  }
  if (meta2.provisional === true) {
    return {
      tone: "proxy",
      label: "PROVISIONAL PIPELINE OUTPUT",
      detail: "meta.json marks this run as provisional, so the numbers are not final pipeline output."
    };
  }
  const substituted = meta2.sources.filter((s) => s.substitution_note).length;
  const detail = substituted ? `${plural(meta2.sources.length, "input product", "input products")} listed in meta.json, ${plural(substituted, "one carries", "carry")} a documented substitution. Open the methods panel on the map screen.` : `${plural(meta2.sources.length, "input product", "input products")} listed in meta.json with provider and licence for each.`;
  return { tone: "observed", label: "OBSERVED INPUTS", detail };
}
function ledgerState(data2) {
  const method2 = data2.citiesMethod;
  if (!method2) {
    return {
      tone: "unverified",
      label: "LEDGER METHOD UNPUBLISHED",
      detail: "cities_method.json did not load, so the per field provenance of this table cannot be shown."
    };
  }
  const counts = methodCounts(method2);
  const proxied = counts.fields.filter((f) => f.proxy > 0).map((f) => f.field.replace(/_/g, " "));
  return {
    tone: "proxy",
    label: "PROXY METHOD, NOT THE HOUSTON MODEL",
    detail: proxied.length ? `Fields carrying proxy or assumed values: ${proxied.join(", ")}. Full per field sources and limitations are at the bottom of this screen.` : "Per field sources and limitations are listed at the bottom of this screen."
  };
}
function transferState(data2) {
  if (data2.laSegments.length) {
    return {
      tone: "observed",
      label: "LOS ANGELES CORRIDOR EXTRACTED",
      detail: data2.laSource ? `Los Angeles geometry source: ${data2.laSource}` : "Los Angeles geometry loaded from a committed extraction."
    };
  }
  return {
    tone: "illustrative",
    label: "ILLUSTRATIVE, NO MEASURED LOS ANGELES DATA",
    detail: "No Los Angeles corridor has been extracted or modelled. The right hand panel is deliberately empty rather than drawn from invented geometry."
  };
}
function provenanceFor(screen, data2) {
  if (!data2) return null;
  if (screen === "ledger") return ledgerState(data2);
  if (screen === "transfer") return transferState(data2);
  return houstonState(data2);
}
const humanise = (key) => key.replace(/_/g, " ").replace(/\bpct\b/, "percent").replace(/\bc\b/, "celsius");
const isScalar = (v) => typeof v === "string" || typeof v === "number";
function StatusTag({ isProxy }) {
  if (isProxy === false) return /* @__PURE__ */ jsx("span", { className: "tag measured", children: "Measured" });
  if (isProxy === true) return /* @__PURE__ */ jsx("span", { className: "tag assumed", children: "Proxy or assumed" });
  return /* @__PURE__ */ jsx("span", { className: "tag unstated", children: "Not stated" });
}
function ScalarRows({ value }) {
  const rows = Object.entries(value).filter(([k, v]) => k !== "is_proxy" && isScalar(v));
  if (!rows.length) return null;
  return /* @__PURE__ */ jsx("dl", { className: "field-rows", children: rows.map(([k, v]) => /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx("dt", { children: humanise(k) }),
    /* @__PURE__ */ jsx("dd", { children: String(v) })
  ] }, k)) });
}
function ListRows({ value }) {
  const lists = Object.entries(value).filter(([, v]) => Array.isArray(v) && v.length);
  if (!lists.length) return null;
  return /* @__PURE__ */ jsx(Fragment, { children: lists.map(([k, items]) => /* @__PURE__ */ jsxs("details", { className: "scenes", children: [
    /* @__PURE__ */ jsxs("summary", { children: [
      n0(items.length),
      " ",
      humanise(k)
    ] }),
    /* @__PURE__ */ jsx("ul", { children: items.map((item, i) => /* @__PURE__ */ jsx("li", { children: item && typeof item === "object" ? Object.entries(item).filter(([, v]) => isScalar(v)).map(([ik, iv]) => `${humanise(ik)} ${iv}`).join(", ") : String(item) }, i)) })
  ] }, k)) });
}
function CityBlock({ id, city, name }) {
  const fields = Object.entries(city).filter(([, v]) => v && typeof v === "object" && !Array.isArray(v) && "is_proxy" in v);
  const other = Object.entries(city).filter(([, v]) => isScalar(v));
  const nested = Object.entries(city).filter(([, v]) => v && typeof v === "object" && !Array.isArray(v) && !("is_proxy" in v));
  return /* @__PURE__ */ jsxs("details", { className: "city-method", children: [
    /* @__PURE__ */ jsxs("summary", { children: [
      /* @__PURE__ */ jsx("span", { className: "cm-name", children: name || humanise(id) }),
      /* @__PURE__ */ jsx("span", { className: "cm-tags", children: fields.map(([k, v]) => /* @__PURE__ */ jsxs("span", { className: "cm-pair", children: [
        humanise(k),
        " ",
        /* @__PURE__ */ jsx(StatusTag, { isProxy: v.is_proxy })
      ] }, k)) })
    ] }),
    other.length || nested.length ? /* @__PURE__ */ jsxs("dl", { className: "field-rows", children: [
      other.map(([k, v]) => /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("dt", { children: humanise(k) }),
        /* @__PURE__ */ jsx("dd", { children: String(v) })
      ] }, k)),
      nested.map(([k, v]) => /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("dt", { children: humanise(k) }),
        /* @__PURE__ */ jsx("dd", { children: Object.entries(v).filter(([, iv]) => isScalar(iv)).map(([ik, iv]) => `${humanise(ik)} ${iv}`).join(", ") })
      ] }, k))
    ] }) : null,
    fields.map(([k, v]) => /* @__PURE__ */ jsxs("section", { className: "field", children: [
      /* @__PURE__ */ jsxs("div", { className: "field-head", children: [
        /* @__PURE__ */ jsx("h5", { children: humanise(k) }),
        /* @__PURE__ */ jsx(StatusTag, { isProxy: v.is_proxy })
      ] }),
      /* @__PURE__ */ jsx(ScalarRows, { value: v }),
      /* @__PURE__ */ jsx(ListRows, { value: v })
    ] }, k))
  ] });
}
function CityMethods({ method: method2, cities: cities2 }) {
  if (!method2) {
    return /* @__PURE__ */ jsxs("section", { className: "panel pane city-methods", "aria-label": "Ledger methods and limitations", children: [
      /* @__PURE__ */ jsx("div", { className: "pane-head", children: /* @__PURE__ */ jsx("h3", { children: "Methods and limitations" }) }),
      /* @__PURE__ */ jsx("p", { className: "label", children: "cities_method.json did not load. Without it there is no per field record of which of these numbers were measured and which were assumed, so treat the whole table as unverified." })
    ] });
  }
  const counts = methodCounts(method2);
  const nameOf = (id) => (cities2 || []).find((c) => c.id === id)?.name || null;
  const summary = method2.method_summary || {};
  const limits = Array.isArray(method2.known_limitations) ? method2.known_limitations : [];
  const entries = Object.entries(method2.cities || {});
  return /* @__PURE__ */ jsxs("section", { className: "panel pane city-methods", "aria-label": "Ledger methods and limitations", children: [
    /* @__PURE__ */ jsxs("div", { className: "pane-head", children: [
      /* @__PURE__ */ jsx("h3", { children: "Methods and limitations, field by field" }),
      /* @__PURE__ */ jsx("span", { className: "label", children: "from cities_method.json, rendered verbatim" })
    ] }),
    method2.purpose ? /* @__PURE__ */ jsx("p", { className: "lede", children: method2.purpose }) : null,
    counts.fields.length ? /* @__PURE__ */ jsxs("table", { className: "coverage", children: [
      /* @__PURE__ */ jsxs("caption", { className: "label", children: [
        "What was measured and what was assumed, across ",
        n0(counts.total),
        " cities"
      ] }),
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { scope: "col", children: "Field" }),
        /* @__PURE__ */ jsx("th", { scope: "col", children: "Measured" }),
        /* @__PURE__ */ jsx("th", { scope: "col", children: "Proxy or assumed" }),
        /* @__PURE__ */ jsx("th", { scope: "col", children: "Not stated" })
      ] }) }),
      /* @__PURE__ */ jsx("tbody", { children: counts.fields.map((f) => /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { scope: "row", children: humanise(f.field) }),
        /* @__PURE__ */ jsx("td", { children: n0(f.measured) }),
        /* @__PURE__ */ jsx("td", { className: f.proxy ? "warn" : "", children: n0(f.proxy) }),
        /* @__PURE__ */ jsx("td", { className: f.unstated ? "warn" : "", children: n0(f.unstated) })
      ] }, f.field)) })
    ] }) : null,
    Object.keys(summary).length ? /* @__PURE__ */ jsxs("div", { className: "src", children: [
      /* @__PURE__ */ jsx("div", { className: "label", children: "How each field was produced" }),
      /* @__PURE__ */ jsx("dl", { className: "field-rows", children: Object.entries(summary).filter(([, v]) => isScalar(v)).map(([k, v]) => /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("dt", { children: humanise(k) }),
        /* @__PURE__ */ jsx("dd", { children: String(v) })
      ] }, k)) })
    ] }) : null,
    limits.length ? /* @__PURE__ */ jsxs("div", { className: "src", children: [
      /* @__PURE__ */ jsx("div", { className: "label", children: "What this method does not do, uncorrected" }),
      /* @__PURE__ */ jsx("ul", { className: "limits", children: limits.map((l, i) => /* @__PURE__ */ jsx("li", { children: l }, i)) })
    ] }) : null,
    entries.length ? /* @__PURE__ */ jsxs("div", { className: "src", children: [
      /* @__PURE__ */ jsx("div", { className: "label", children: "Per city record, expand any city for its sources and caveats" }),
      /* @__PURE__ */ jsx("div", { className: "city-methods-list", children: entries.map(([id, city]) => /* @__PURE__ */ jsx(CityBlock, { id, city, name: nameOf(id) }, id)) })
    ] }) : null
  ] });
}
const useStore = create(() => ({
  screen: "walk",
  hour: "17",
  budget: 75e4,
  selected: null,
  heat: 0.45,
  pitch: 0
}));
const setScreen = (screen) => useStore.setState({ screen });
const FOCUS = "houston";
const CLUSTER_PCT = 15;
function Sparkbar({ value, max, focus }) {
  const w = Math.max(2, Math.round(value / max * 100));
  return /* @__PURE__ */ jsxs("svg", { viewBox: "0 0 100 8", preserveAspectRatio: "none", style: { height: 8 }, "aria-hidden": "true", children: [
    /* @__PURE__ */ jsx("rect", { x: "0", y: "2.5", width: "100", height: "3", rx: "1.5", fill: "#262B33" }),
    /* @__PURE__ */ jsx("rect", { x: "0", y: "2", width: w, height: "4", rx: "2", fill: exposureCss(value / max), opacity: focus ? 1 : 0.75 })
  ] });
}
function joinNames(names) {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
function fieldStatus(method2, id, field) {
  const entry = method2?.cities?.[id]?.[field];
  if (!entry || typeof entry !== "object") return null;
  if (entry.is_proxy === true) return "assumed";
  if (entry.is_proxy === false) return "measured";
  return null;
}
function Ledger({ data: data2 }) {
  const method2 = data2.citiesMethod;
  const cities2 = useMemo(
    () => data2.cities.slice().sort((a, b) => (b.degmin_per_trip ?? 0) - (a.degmin_per_trip ?? 0)),
    [data2.cities]
  );
  const reading = useMemo(() => {
    if (!cities2.length) return null;
    const leader = cities2[0];
    const top = leader.degmin_per_trip ?? 0;
    if (!top) return { leader, near: [], spread: 0 };
    const near = cities2.slice(1).filter((c) => (top - (c.degmin_per_trip ?? 0)) / top * 100 <= CLUSTER_PCT);
    const last = near.length ? near[near.length - 1] : cities2[1];
    const spread = last ? (top - (last.degmin_per_trip ?? 0)) / top * 100 : 0;
    return { leader, near, spread };
  }, [cities2]);
  if (!cities2.length) {
    return /* @__PURE__ */ jsx(EmptyState, { title: "No city ledger", body: "cities.json is missing or empty, so the comparison cannot be drawn.", hint: "npm run data" });
  }
  const max = Math.max(...cities2.map((c) => c.degmin_per_trip ?? 0)) || 1;
  const focusIndex = cities2.findIndex((c) => c.id === FOCUS);
  const focusCity = focusIndex >= 0 ? cities2[focusIndex] : null;
  const bufferMiles = method2?.cities ? Object.values(method2.cities).map((c) => c.buffer_miles).find(Number.isFinite) : null;
  return /* @__PURE__ */ jsxs("div", { className: "ledger", children: [
    /* @__PURE__ */ jsxs("div", { className: "ledger-top", children: [
      /* @__PURE__ */ jsxs("div", { className: "ledger-head", children: [
        /* @__PURE__ */ jsxs("h2", { children: [
          n0(cities2.length),
          " host cities, ranked by a deliberately lighter proxy than the Houston model."
        ] }),
        /* @__PURE__ */ jsxs("p", { children: [
          reading.leader.name,
          " is top of this table at ",
          n1(reading.leader.degmin_per_trip),
          " degree-minutes per trip.",
          " ",
          reading.near.length ? `${joinNames(reading.near.map((c) => c.name))} ${reading.near.length > 1 ? "sit" : "sits"} within ${CLUSTER_PCT} percent of it, a spread of ${n1(reading.spread)} percent across the leading ${n0(reading.near.length + 1)}. This method cannot separate that group, and nothing here should be read as it doing so.` : `The next city is ${n1(reading.spread)} percent below it, the widest gap in the table.`,
          focusCity && focusIndex > 0 ? ` Houston, the corridor modelled segment by segment on the other screens, ranks ${n0(focusIndex + 1)} of ${n0(cities2.length)} here.` : ""
        ] }),
        /* @__PURE__ */ jsx("p", { children: "The scatter asks the obvious follow up and answers it with a flat line. Canopy percent across a whole city does not predict what a fan carries on the last mile. Latitude, humidity, kickoff time and the geometry of the specific walk do. That is the argument for modelling the walk itself rather than ranking cities by a canopy statistic." })
      ] }),
      /* @__PURE__ */ jsx(CityScatter, { cities: cities2, focus: FOCUS })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "panel method-note", "aria-label": "How this ledger differs from the Houston model", children: [
      /* @__PURE__ */ jsx("h3", { children: "This is not the model behind the other three screens." }),
      /* @__PURE__ */ jsxs("div", { className: "mn-grid", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("div", { className: "k", children: "The Houston screens use" }),
          /* @__PURE__ */ jsx("p", { children: "Wet bulb globe temperature per hour from station observations, ray traced building shadow, and the geometry of each walking segment between platform and gate." })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("div", { className: "k", children: "This ledger uses" }),
          /* @__PURE__ */ jsxs("p", { children: [
            "Tree canopy and Landsat land surface temperature inside a",
            bufferMiles ? ` ${n1(bufferMiles)} mile` : "",
            " radius buffer around each venue, combined with one flat nominal trip duration applied identically to every city."
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("div", { className: "k", children: "So this table has" }),
          /* @__PURE__ */ jsx("p", { children: "No WBGT, no ray tracing, no route geometry and no per city walking distance. Surface temperature is not what a person feels. Degree-minutes per trip here is a scaled proxy anchored to the Houston pipeline result, not an independent measurement of any other city." })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "multiples", children: cities2.map((c, i) => {
      const focus = c.id === FOCUS;
      const matchesStatus = fieldStatus(method2, c.id, "matches");
      const canopyStatus = fieldStatus(method2, c.id, "canopy_pct");
      const lstStatus = fieldStatus(method2, c.id, "lst_p90_c");
      return /* @__PURE__ */ jsxs("article", { className: `panel city${focus ? " is-focus" : ""}`, children: [
        /* @__PURE__ */ jsxs("div", { className: "top", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("h3", { children: [
              i + 1,
              ". ",
              c.name
            ] }),
            /* @__PURE__ */ jsx("div", { className: "venue", children: c.venue })
          ] }),
          focus ? /* @__PURE__ */ jsx("span", { className: "chip", title: "The proxy formula is scaled so this city matches the full Houston pipeline result", children: "ANCHOR CITY" }) : null
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "n", children: [
          n1(c.degmin_per_trip),
          " ",
          /* @__PURE__ */ jsx("small", { children: "degmin per trip, proxy" })
        ] }),
        /* @__PURE__ */ jsx(Sparkbar, { value: c.degmin_per_trip ?? 0, max, focus }),
        /* @__PURE__ */ jsxs("div", { className: "stat-grid", children: [
          /* @__PURE__ */ jsxs("div", { className: "stat", children: [
            /* @__PURE__ */ jsx("div", { className: "k", children: "Canopy" }),
            /* @__PURE__ */ jsxs("div", { className: "v", children: [
              n1(c.canopy_pct),
              "%"
            ] }),
            canopyStatus ? /* @__PURE__ */ jsx("div", { className: `tag ${canopyStatus}`, children: canopyStatus === "measured" ? "Measured" : "Assumed" }) : null
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "stat", children: [
            /* @__PURE__ */ jsx("div", { className: "k", children: "LST p90" }),
            /* @__PURE__ */ jsxs("div", { className: "v", children: [
              n1(c.lst_p90_c),
              " C"
            ] }),
            lstStatus ? /* @__PURE__ */ jsx("div", { className: `tag ${lstStatus}`, children: lstStatus === "measured" ? "Measured" : "Assumed" }) : null
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "stat", children: [
            /* @__PURE__ */ jsx("div", { className: "k", children: "Matches" }),
            /* @__PURE__ */ jsx("div", { className: "v", children: n0(c.matches) }),
            matchesStatus ? /* @__PURE__ */ jsx("div", { className: `tag ${matchesStatus}`, children: matchesStatus === "measured" ? "Measured" : "Assumed" }) : null
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "stat", children: [
            /* @__PURE__ */ jsx("div", { className: "k", children: "Proxy times matches" }),
            /* @__PURE__ */ jsx("div", { className: "v", children: n0((c.degmin_per_trip ?? 0) * (c.matches ?? 0)) })
          ] })
        ] })
      ] }, c.id);
    }) }),
    /* @__PURE__ */ jsx(CityMethods, { method: method2, cities: cities2 }),
    /* @__PURE__ */ jsx("div", { style: { marginTop: 24 }, children: /* @__PURE__ */ jsxs("button", { type: "button", className: "continue", onClick: () => setScreen("transfer"), children: [
      "Move the method to Los Angeles 2028",
      /* @__PURE__ */ jsx("span", { "aria-hidden": "true", children: "→" })
    ] }) })
  ] });
}
const join = (parts) => parts.filter(Boolean).join(", ");
const UNSOURCED = /^no\b[^.]*\b(located|found|exists|available)\b|order of magnitude estimate/i;
function isUnsourced(cost) {
  if (typeof cost.sourced === "boolean") return !cost.sourced;
  if (typeof cost.is_proxy === "boolean") return cost.is_proxy;
  if (typeof cost.citation_status === "string") return /unsourced|estimate|none/i.test(cost.citation_status);
  if (typeof cost.citation !== "string") return false;
  return UNSOURCED.test(cost.citation.split(". ")[0]);
}
function MethodsPanel({ meta: meta2, solutionMethod, heat }) {
  if (!meta2) {
    return /* @__PURE__ */ jsxs("section", { className: "panel pane methods", "aria-label": "Methods and provenance", children: [
      /* @__PURE__ */ jsx("div", { className: "pane-head", children: /* @__PURE__ */ jsx("h3", { children: "Methods" }) }),
      /* @__PURE__ */ jsx("p", { className: "label", children: "meta.json did not load, so provenance cannot be shown and nothing on this screen should be quoted." })
    ] });
  }
  const v = meta2.validation || {};
  const rawThreshold = meta2.wbgt_threshold_c ?? meta2.threshold_wbgt_c;
  const threshold = Number.isFinite(rawThreshold) ? rawThreshold : null;
  const speed = Number.isFinite(meta2.walk_speed_ms) ? `, walked at ${n1(meta2.walk_speed_ms)} m/s` : "";
  const segs = Number.isFinite(meta2.n_segments) ? `, ${n0(meta2.n_segments)} segments` : "";
  const metric = `Degree-minutes above WBGT ${tempC(threshold)}${speed}${segs}.${speed ? "" : " Walking speed is not stated in meta.json."}`;
  const costs = meta2.costs || [];
  const unsourced = costs.filter(isUnsourced).length;
  return /* @__PURE__ */ jsxs("section", { className: "panel pane methods", "aria-label": "Methods and provenance", children: [
    /* @__PURE__ */ jsxs("div", { className: "pane-head", children: [
      /* @__PURE__ */ jsx("h3", { children: "Methods and provenance" }),
      /* @__PURE__ */ jsx("span", { className: "label", children: meta2.generated_utc ? meta2.generated_utc.slice(0, 10) : "undated" })
    ] }),
    /* @__PURE__ */ jsxs("dl", { children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("dt", { children: "Heat model" }),
        /* @__PURE__ */ jsx("dd", { children: join([meta2.model?.wbgt, meta2.model?.implementation, meta2.model?.pvlib_version ? `pvlib ${meta2.model.pvlib_version}` : null]) })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("dt", { children: "Metric" }),
        /* @__PURE__ */ jsx("dd", { children: metric })
      ] }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("dt", { children: "Validation" }),
        /* @__PURE__ */ jsx("dd", { children: Number.isFinite(v.rmse_c) ? `RMSE ${n2(v.rmse_c)} C, bias ${n2(v.bias_c)} C, ${n0(v.n_stations)} stations, ${n0(v.n_samples)} samples${v.quantity_validated ? `, on ${v.quantity_validated}` : ""}` : "meta.json reports no validation figures for this run." })
      ] }),
      v.method ? /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("dt", { children: "Validation caveat" }),
        /* @__PURE__ */ jsx("dd", { className: "fine", children: v.method })
      ] }) : null,
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("dt", { children: "Allocation" }),
        /* @__PURE__ */ jsx("dd", { children: solutionMethod ? `${solutionMethod}, solved offline, every budget level precomputed` : "solutions.json names no method for the allocation." })
      ] }),
      heat ? /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("dt", { children: "Heat surface" }),
        /* @__PURE__ */ jsx("dd", { children: heat.available ? join([
          heat.method,
          heat.grid ? `${heat.grid[0]} by ${heat.grid[1]} grid` : null,
          heat.domainStated ? `domain ${heat.domain[0]} to ${heat.domain[1]} C` : "colour domain not stated in expo_meta.json"
        ]) : "expo raster not present, the map falls back to the baked shade masks" })
      ] }) : null
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "src", children: [
      /* @__PURE__ */ jsx("div", { className: "label", children: "Data products" }),
      (meta2.sources || []).map((s, i) => /* @__PURE__ */ jsxs("div", { className: "src-item", children: [
        /* @__PURE__ */ jsx("div", { className: "p", children: s.product }),
        /* @__PURE__ */ jsx("div", { className: "m", children: join([s.layer, s.resolution, s.acquired || s.date_used, s.provider, s.licence]) }),
        s.substitution_note ? /* @__PURE__ */ jsxs("div", { className: "m", children: [
          /* @__PURE__ */ jsx("span", { className: "tag assumed", children: "Substitution" }),
          " ",
          s.substitution_note
        ] }) : null
      ] }, `${s.layer}-${i}`))
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "src", children: [
      /* @__PURE__ */ jsxs("div", { className: "label", children: [
        "Unit costs",
        unsourced ? `, ${n0(unsourced)} of ${n0(costs.length)} with no public unit cost located` : ""
      ] }),
      costs.map((c) => {
        const open = isUnsourced(c);
        return /* @__PURE__ */ jsxs("div", { className: `src-item${open ? " is-unsourced" : ""}`, children: [
          /* @__PURE__ */ jsxs("div", { className: "p", children: [
            c.item,
            ", ",
            usd(c.unit_cost_usd),
            open ? /* @__PURE__ */ jsx("span", { className: "tag assumed", children: "Unsourced estimate" }) : null
          ] }),
          open ? /* @__PURE__ */ jsx("div", { className: "m", children: "No public unit cost was located for this item, so the figure is a stated estimate rather than a citation. The search that failed is written out below so it can be checked or beaten." }) : null,
          /* @__PURE__ */ jsx("div", { className: "m", children: c.citation })
        ] }, c.item);
      })
    ] })
  ] });
}
const read = (n) => JSON.parse(readFileSync(`public/data/${n}`, "utf8"));
const cities = read("cities.json");
const method = read("cities_method.json");
const meta = read("meta.json");
const data = {
  segments: [{ id: "a" }],
  cities,
  citiesMethod: method,
  meta,
  threshold: meta.wbgt_threshold_c,
  laSegments: [],
  laSource: null
};
const html = renderToString(/* @__PURE__ */ jsx(Ledger, { data }));
console.log("LEDGER OK", html.length);
console.log(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 2e4));
console.log("---METHODS---");
console.log(renderToString(/* @__PURE__ */ jsx(MethodsPanel, { meta, solutionMethod: "greedy", heat: null })).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 2e4));
console.log("---PROVENANCE---");
for (const s of ["walk", "ledger", "transfer"]) console.log(s, JSON.stringify(provenanceFor(s, data)));
