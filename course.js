/* Course search for the static scorecard.
   Reads GolfCore's public API from the browser (CORS *, no API key).
   Japanese hole pars are not available from OpenStreetMap in any useful
   quantity, and other scorecard APIs need a secret that cannot live in
   this GitHub Pages site. */
(function (root) {
  "use strict";

  const API = "https://api.golfcore.org/v1";

  function readPar(value) {
    const n = Math.round(Number(value));
    return n === 3 || n === 4 || n === 5 ? n : null;
  }

  function readYards(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }

  function holesByPosition(holes) {
    const map = new Map();
    if (!Array.isArray(holes)) return map;
    holes.forEach((hole) => {
      const pos = Math.round(Number(hole && hole.position));
      if (pos > 0) map.set(pos, hole);
    });
    return map;
  }

  function seriesFrom(map, count) {
    const out = [];
    for (let pos = 1; pos <= count; pos += 1) {
      const hole = map.get(pos);
      if (!hole) return null;
      const par = readPar(hole.par);
      if (par == null) return null;
      out.push({ par, yards: readYards(hole.yards) });
    }
    return out;
  }

  function teeId(tee) {
    const name = String((tee && tee.name) || "").trim();
    const gender = String((tee && tee.gender) || "").trim();
    if (!name) return "";
    return gender ? `${name} (${gender})` : name;
  }

  function usableTees(layoutHoles, rawTees) {
    const tees = [];
    (rawTees || []).forEach((tee) => {
      const id = teeId(tee);
      if (!id) return;
      const map = holesByPosition(tee.holes);
      const holes = layoutHoles.map((base, index) => {
        const raw = map.get(index + 1) || {};
        const par = readPar(raw.par) || base.par;
        const yards = readYards(raw.yards);
        return { par, yards: yards != null ? yards : base.yards };
      });
      const hasYard = holes.some((hole) => hole.yards != null);
      if (!hasYard) return;
      tees.push({
        id,
        name: String(tee.name),
        gender: tee.gender || "",
        holes,
      });
    });
    return tees;
  }

  function defaultTeeId(layout) {
    if (!layout.tees.length) return "";
    const ref = layout.holes.map((hole) => hole.yards).join(",");
    const matched = layout.tees.find((tee) => tee.holes.map((hole) => hole.yards).join(",") === ref);
    if (matched) return matched.id;
    const regular = layout.tees.find(
      (tee) => /regular|white|レギュラー|白/i.test(tee.name) && tee.gender !== "F"
    );
    if (regular) return regular.id;
    const male = layout.tees.find((tee) => tee.gender === "M");
    return (male || layout.tees[0]).id;
  }

  function classifyCourse(detail) {
    const layouts = [];
    (detail && detail.layouts ? detail.layouts : []).forEach((layout, index) => {
      const map = holesByPosition(layout.holes);
      const full = seriesFrom(map, 18);
      const nine = full ? null : seriesFrom(map, 9);
      const holes = full || nine;
      if (!holes) return;
      const normalized = {
        key: String(index),
        name: String(layout.name || `レイアウト ${index + 1}`),
        kind: full ? "18" : "9",
        holes,
        tees: usableTees(holes, layout.tees),
      };
      normalized.defaultTeeId = defaultTeeId(normalized);
      layouts.push(normalized);
    });

    const fulls = layouts.filter((layout) => layout.kind === "18");
    const nines = layouts.filter((layout) => layout.kind === "9");
    let kind = "none";
    if (!layouts.length) kind = "none";
    else if (fulls.length === 1 && !nines.length) kind = "single-18";
    else if (!fulls.length && nines.length === 1) kind = "single-9";
    else if (fulls.length && nines.length) kind = "mixed";
    else if (fulls.length > 1) kind = "pick-18";
    else if (nines.length > 1) kind = "pick-9";

    return {
      slug: detail && detail.slug ? String(detail.slug) : "",
      name: (detail && (detail.native_name || detail.name)) || "",
      url: (detail && detail.url) || "",
      city: (detail && detail.city) || "",
      kind,
      layouts,
    };
  }

  function holesForLayout(layout, teeIdWanted) {
    if (!layout) return [];
    const tee = layout.tees.find((item) => item.id === teeIdWanted);
    return (tee ? tee.holes : layout.holes).map((hole) => ({
      par: hole.par,
      yards: hole.yards == null ? null : hole.yards,
    }));
  }

  function cardFromSelection(classified, selection) {
    const layouts = classified.layouts;
    const byKey = (key) => layouts.find((layout) => layout.key === key);
    if (selection.mode === "18") {
      const layout = byKey(selection.key);
      if (!layout || layout.kind !== "18") return null;
      const teeId = selection.teeId || layout.defaultTeeId || "";
      return {
        holes: holesForLayout(layout, teeId),
        areas: [layout.name],
        tee: teeId,
        partial: false,
      };
    }
    if (selection.mode === "9") {
      const front = byKey(selection.frontKey);
      if (!front || front.kind !== "9") return null;
      const teeId = selection.teeId || front.defaultTeeId || "";
      const frontHoles = holesForLayout(front, teeId);
      let backHoles = Array.from({ length: 9 }, () => null);
      const areas = [front.name];
      if (selection.backKey) {
        const back = byKey(selection.backKey);
        if (!back || back.kind !== "9" || back.key === front.key) return null;
        backHoles = holesForLayout(back, selection.teeId || back.defaultTeeId || "");
        areas.push(back.name);
      }
      return {
        holes: frontHoles.concat(backHoles),
        areas,
        tee: teeId,
        partial: !selection.backKey,
      };
    }
    return null;
  }

  function mapSearchHit(course) {
    return {
      slug: course.slug,
      name: course.native_name || course.name || course.slug,
      englishName: course.name || "",
      city: course.city || "",
      holeCount: course.hole_count,
      parTotal: course.par_total,
      scorecard: !!(course.coverage && course.coverage.scorecard),
      url: course.url || "",
    };
  }

  async function readError(response) {
    const error = new Error(`GolfCore ${response.status}`);
    error.status = response.status;
    return error;
  }

  async function searchCourses(query) {
    const url = new URL(`${API}/courses`);
    url.searchParams.set("country", "jp");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "8");
    const response = await fetch(url.toString());
    if (!response.ok) throw await readError(response);
    const data = await response.json();
    return {
      total: data.total || 0,
      courses: (data.courses || []).map(mapSearchHit),
    };
  }

  async function fetchCourse(slug) {
    const response = await fetch(`${API}/courses/${encodeURIComponent(slug)}`);
    if (!response.ok) throw await readError(response);
    const detail = await response.json();
    return classifyCourse(detail);
  }

  root.GolfCourses = {
    API,
    classifyCourse,
    cardFromSelection,
    searchCourses,
    fetchCourse,
    defaultTeeId,
  };
})(typeof window !== "undefined" ? window : globalThis);
