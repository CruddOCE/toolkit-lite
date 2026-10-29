// Navigator: follows a route from server /api/route and reports where the
// device is on it. It holds no timers and makes no network calls. map.js
// feeds it GPS fixes and decides what to do with the answer (speak, reroute).
// Kept free of browser APIs so the same file runs in Node tests.

const ARRIVE_RADIUS_M = 25;     // a step counts as passed inside this radius
const OFF_ROUTE_M = 40;         // more than this from the line is "off route"
const OFF_ROUTE_FIXES = 3;      // ...for this many fixes in a row

function distanceM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Distance from a point to the nearest segment of the route line. Vertex
// distance alone would call a fix off route when it sits midway between two
// vertices. Over a single route segment (a few hundred metres at most) a local
// flat-earth projection is accurate to well under a metre.
function distanceToRouteM(pos, geometry) {
  const metresPerDegLat = 111195;
  const metresPerDegLng = metresPerDegLat * Math.cos((pos.lat * Math.PI) / 180);
  let best = Infinity;
  for (let i = 0; i < geometry.length - 1; i += 1) {
    const ax = (geometry[i][1] - pos.lng) * metresPerDegLng;
    const ay = (geometry[i][0] - pos.lat) * metresPerDegLat;
    const bx = (geometry[i + 1][1] - pos.lng) * metresPerDegLng;
    const by = (geometry[i + 1][0] - pos.lat) * metresPerDegLat;
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    // Parameter of the closest point on the segment, clamped to its ends.
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq));
    const px = ax + t * dx;
    const py = ay + t * dy;
    const d = Math.sqrt(px * px + py * py);
    if (d < best) best = d;
  }
  return best;
}

function createNavigator(route) {
  if (!route || !Array.isArray(route.steps) || route.steps.length === 0) {
    throw new Error('navigator needs a route with steps');
  }
  let stepIndex = 0;
  let missedFixes = 0;
  let arrived = false;
  let firstFix = true;

  function update(pos) {
    const last = route.steps.length - 1;
    const onRoute = distanceToRouteM(pos, route.geometry) <= OFF_ROUTE_M;
    missedFixes = onRoute ? 0 : missedFixes + 1;

    // The depart step is only worth announcing from the start point. If the
    // first fix is already away from it (app opened mid-route), skip it.
    if (firstFix && route.steps[0].maneuver === 'depart' && last > 0) {
      if (distanceM(pos, route.steps[0].location) > ARRIVE_RADIUS_M) stepIndex = 1;
    }
    firstFix = false;

    // Advance past every step we are already inside, so a fix that skips a
    // step does not leave the prompt stuck on a finished manoeuvre.
    while (stepIndex < last && distanceM(pos, route.steps[stepIndex].location) <= ARRIVE_RADIUS_M) {
      stepIndex += 1;
    }
    if (stepIndex === last && distanceM(pos, route.steps[last].location) <= ARRIVE_RADIUS_M) {
      arrived = true;
    }

    return {
      stepIndex,
      instruction: route.steps[stepIndex].instruction,
      distanceToNextM: arrived ? 0 : distanceM(pos, route.steps[stepIndex].location),
      offRoute: missedFixes >= OFF_ROUTE_FIXES,
      arrived,
    };
  }

  return { update };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createNavigator, distanceM, distanceToRouteM };
}
